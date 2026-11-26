const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const testUri = process.env.TEST_MONGODB_URI;
test('Jira status mapping persists per connection and unmatched transitions never log success', { skip: !testUri, timeout: 60000 }, async (t) => {
  const uri = new URL(testUri); assert.match(uri.pathname, /^\/etms_test(?:_[a-z0-9-]+)?$/);
  uri.pathname = `/etms_test_${new mongoose.Types.ObjectId()}`;
  Object.assign(process.env, { MONGODB_URI: uri.toString(), JWT_SECRET: 'jira-status-test', REDIS_URL: '', NODE_ENV: 'test' });
  const realFetch = global.fetch; let remoteStatus = 'To Do'; let transitions = 0; let comments = 0; let requests = 0;
  t.mock.method(global, 'fetch', async (url, options = {}) => {
    if (String(url).startsWith('http://127.0.0.1:')) return realFetch(url, options);
    const parsed = new URL(url); assert.equal(parsed.origin, 'https://jira.example.test'); requests++;
    assert.equal(Buffer.from(options.headers.Authorization.slice(6), 'base64').toString(), 'owner@example.test:fixture-token');
    let body;
    if (options.method === 'PUT') body = null;
    else if (parsed.search === '?fields=status') body = { fields: { status: { name: remoteStatus } } };
    else if (parsed.pathname.endsWith('/transitions') && options.method === 'POST') {
      assert.equal(JSON.parse(options.body).transition.id, '31'); transitions++; remoteStatus = 'In Progress'; body = null;
    } else if (parsed.pathname.endsWith('/transitions')) body = { transitions: remoteStatus === 'To Do' ? [{ id: '31', name: 'Start work', to: { name: 'In Progress' } }] : [] };
    else if (parsed.pathname.endsWith('/comment')) { comments++; body = { id: 'comment' }; }
    else throw new Error('Unexpected Jira endpoint');
    return new Response(body ? JSON.stringify(body) : null, { status: body ? 200 : 204 });
  });
  const { app } = require('../../server'); const m = require('../../models');
  const { encryptCredential } = require('../../services/integrationCredentialService');
  const { processIntegrationJob } = require('../../services/integrationSyncService');
  await mongoose.connect(uri.toString());
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  try {
    const role = await m.Role.create({ name: 'User', permissions: ['*'] });
    const owner = await m.User.create({ fullName: 'Jira owner', email: 'owner@example.test', passwordHash: 'unused', role: role._id });
    const workspace = await m.Workspace.create({ name: 'Jira status workspace', slug: 'jira-status-test', owner: owner._id });
    const project = await m.Project.create({ name: 'Jira status project', key: 'JSTATUS', workspace: workspace._id, lead: owner._id });
    const cipher = encryptCredential('fixture-token');
    const connection = await m.IntegrationConnection.create({ provider: 'Jira', displayName: 'Jira status fixture', workspace: workspace._id, project: project._id, status: 'Connected', baseUrl: 'https://jira.example.test', externalProjectKey: 'QA', settings: { accountEmail: 'owner@example.test' }, credentialCiphertext: cipher, createdBy: owner._id });
    const bug = await m.Bug.create({ title: 'Fixture sync', description: 'Test only', project: project._id, reportedBy: owner._id, severity: 'Major', priority: 'Medium', status: 'InProgress', approvalStatus: 'Approved', externalIssue: { provider: 'Jira', key: 'QA-1', integration: connection._id } });
    const runJob = (comment) => processIntegrationJob({ name: 'jira-bug-sync', data: { bugId: bug._id, integrationId: connection._id, userId: owner._id, comment }, attemptsMade: 0 });
    await assert.rejects(runJob(), /Không có transition Jira/);
    assert.equal(remoteStatus, 'To Do');
    assert.equal(await m.IntegrationSyncLog.countDocuments({ action: 'SyncBug', status: 'Success' }), 0);
    assert.ok(await m.IntegrationSyncLog.exists({ action: 'SyncBug', status: 'Failed' }));
    const session = await m.UserSession.create({ user: owner._id, token: 'status-test', ipAddress: '127.0.0.1', expiresAt: new Date(Date.now() + 600000) });
    const token = jwt.sign({ id: owner._id, sessionId: session._id }, process.env.JWT_SECRET);
    const patch = async (syncConfig, status = 200) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/integrations/${connection._id}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ syncConfig }) });
      const data = await response.json(); assert.equal(response.status, status, JSON.stringify(data));
      assert.ok(!JSON.stringify(data).includes('fixture-token'));
    };
    await patch({ statusMappings: { InProgress: { name: 'In Progress' } } }, 400);
    await patch({ statusMappings: { Unknown: 'Done' } }, 400);
    const before = requests;
    await patch({ direction: 'Outbound', entities: ['Bug'], statusMappings: { InProgress: ' In Progress ', Resolved: 'In Review', New: 'To Do', Open: 'To Do' } });
    assert.equal(requests, before, 'saving configuration must not mutate Jira');
    const saved = await m.IntegrationConnection.findById(connection._id).select('+credentialCiphertext').lean();
    assert.equal(saved.syncConfig.statusMappings.InProgress, 'In Progress');
    assert.equal(saved.credentialCiphertext, cipher); assert.equal(saved.status, 'Connected');
    await runJob('Fixture comment');
    assert.equal(remoteStatus, 'In Progress'); assert.equal(transitions, 1); assert.equal(comments, 1);
    assert.ok(await m.IntegrationSyncLog.exists({ status: 'Success', message: /In Progress/ }));
    await runJob();
    assert.equal(transitions, 1, 'already-correct Jira status needs no transition');
    const lastSync = (await m.IntegrationConnection.findById(connection._id)).lastSyncAt;
    await m.Bug.updateOne({ _id: bug._id }, { status: 'Resolved' });
    await assert.rejects(runJob('Must not post after failed transition'), /In Review/);
    assert.equal(remoteStatus, 'In Progress'); assert.equal(comments, 1);
    assert.equal((await m.IntegrationConnection.findById(connection._id)).lastSyncAt.getTime(), lastSync.getTime());
    assert.equal((await m.IntegrationSyncLog.findOne().sort('-createdAt')).status, 'Failed');
  } finally {
    await new Promise(resolve => server.close(resolve));
    await mongoose.connection.dropDatabase(); await mongoose.disconnect();
  }
});
