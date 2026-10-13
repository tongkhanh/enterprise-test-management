const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');

// Never use MONGODB_URI or production database for tests.
const uri = process.env.TEST_MONGODB_URI;
test('isolated API: RBAC, dataset encryption/masking, schedules, signed webhook, optional browser flow', { skip: !uri, timeout: 120000 }, async (t) => {
  const database = new URL(uri).pathname.slice(1);
  assert.match(database, /^etms_test(?:_[a-z0-9-]+)?$/, 'TEST_MONGODB_URI must explicitly name etms_test database');
  process.env.MONGODB_URI = uri; process.env.REDIS_URL = ''; process.env.JWT_SECRET = 'integration-only-secret'; process.env.NODE_ENV = 'test';
  process.env.METRICS_TOKEN = crypto.randomBytes(32).toString('hex');
  const { app } = require('../../server'); const m = require('../../models');
  const { Dataset, Schedule } = require('../../models/execution-automation/AutomationResources');
  const { encryptCredential } = require('../../services/integrationCredentialService');
  await mongoose.connect(uri); // Dedicated test DB only.
  const server = app.listen(0, '127.0.0.1'); await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`; const suffix = crypto.randomBytes(5).toString('hex'); const owned = [];
  const insert = async (Model, data) => { const doc = await Model.create(data); owned.push([Model, doc._id]); return doc; };
  try {
    const role = await insert(m.Role, { name: 'User', permissions: [] });
    const owner = await insert(m.User, { fullName: 'Owner', email: `${suffix}-owner@example.com`, passwordHash: 'unused', role: role._id });
    const guest = await insert(m.User, { fullName: 'Guest', email: `${suffix}-guest@example.com`, passwordHash: 'unused', role: role._id });
    const workspace = await insert(m.Workspace, { name: 'Test Workspace', slug: `test-${suffix}`, owner: owner._id });
    const project = await insert(m.Project, { name: 'Test Project', key: 'TEST', workspace: workspace._id });
    await insert(m.WorkspaceMembership, { workspace: workspace._id, user: guest._id, role: 'Guest' });
    const env = await insert(m.TestEnvironment, { project: project._id, name: 'Local test', status: 'Ready', targetUrl: 'http://127.0.0.1:8080', createdBy: owner._id });
    const tokens = {};
    for (const user of [owner, guest]) {
      const session = await insert(m.UserSession, { user: user._id, token: suffix, ipAddress: '127.0.0.1', expiresAt: new Date(Date.now() + 600000) });
      tokens[String(user._id)] = jwt.sign({ id: user._id, sessionId: session._id }, process.env.JWT_SECRET);
    }
    const request = (route, user, method = 'GET', body) => fetch(base + '/api/v1' + route, { method, headers: { Authorization: `Bearer ${tokens[String(user._id)]}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const payload = { project: String(project._id), name: 'data', format: 'json', content: '[{"email":"qa@example.com","password":"secret-test"}]' };
    assert.equal((await request('/automation-datasets', guest, 'POST', payload)).status, 403);
    const created = await request('/automation-datasets', owner, 'POST', payload); assert.equal(created.status, 201);
    const data = (await created.json()).data; owned.push([Dataset, data._id]); assert.equal(data.encryptedRows, undefined);
    const preview = await request(`/automation-datasets/${data._id}/preview`, guest); assert.equal(preview.status, 200); assert.equal((await preview.json()).data[0].password, '[REDACTED]');
    assert.equal((await request('/automation-schedules', guest, 'POST', { project: String(project._id) })).status, 403);
    const schedule = await request('/automation-schedules', owner, 'POST', { project: String(project._id), environment: String(env._id), name: 'Nightly', cron: '0 2 * * *' });
    assert.equal(schedule.status, 201); const scheduleData = (await schedule.json()).data; owned.push([Schedule, scheduleData._id]);
    assert.equal((await request(`/automation-schedules/${scheduleData._id}`, guest, 'PATCH', { active: false })).status, 403);
    assert.equal((await request(`/automation-schedules/${scheduleData._id}`, owner, 'PATCH', { active: false })).status, 200);
    const integration = await insert(m.IntegrationConnection, { provider: 'GitHub', displayName: 'Test', workspace: workspace._id, project: project._id, createdBy: owner._id, webhookSecretCiphertext: encryptCredential('sign-secret') });
    const raw = '{ "test": true }'; const signature = 'sha256=' + crypto.createHmac('sha256', 'sign-secret').update(raw).digest('hex');
    const webhookHeaders = { 'Content-Type': 'application/json', 'x-hub-signature-256': signature, 'x-github-delivery': suffix, 'x-github-event': 'ping' };
    assert.equal((await fetch(`${base}/api/v1/webhooks/github/${integration._id}`, { method: 'POST', headers: { ...webhookHeaders, 'x-hub-signature-256': 'invalid' }, body: raw })).status, 401);
    assert.equal((await fetch(`${base}/api/v1/webhooks/github/${integration._id}`, { method: 'POST', headers: webhookHeaders, body: raw })).status, 202);
    assert.equal((await fetch(`${base}/api/v1/webhooks/github/${integration._id}`, { method: 'POST', headers: webhookHeaders, body: raw }).then((r) => r.json())).data.duplicate, true);
    await m.WebhookDelivery.deleteMany({ integration: integration._id });
    assert.equal((await fetch(base + '/observability/metrics')).status, 401);
    assert.equal((await fetch(base + '/observability/metrics', { headers: { Authorization: `Bearer ${process.env.METRICS_TOKEN}` } })).status, 200);
    if (process.env.TEST_BROWSER === 'true') await t.test('browser enters authenticated automation operations', async () => {
      const browser = await require('playwright').chromium.launch({ headless: true });
      try { const page = await browser.newPage(); await page.goto(base + '/studio/login'); assert.ok((await page.locator('body').innerText()).length > 20); await page.goto(base + '/studio/automation-operations'); await page.waitForURL('**/login'); } finally { await browser.close(); }
    });
  } finally {
    // Delete only records this test created; never drop an existing database.
    for (const [Model, id] of owned.reverse()) await Model.deleteOne({ _id: id });
    await new Promise((r) => server.close(r)); await mongoose.disconnect();
  }
});
