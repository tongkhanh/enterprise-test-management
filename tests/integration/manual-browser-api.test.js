const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const fs = require('node:fs/promises');
const path = require('node:path');

test('Manual browser API enforces project/mode/approval, ignores client target URLs and links screenshots to the execution', { skip: !process.env.TEST_MONGODB_URI, timeout: 60000 }, async (t) => {
  const uri = new URL(process.env.TEST_MONGODB_URI);
  assert.match(uri.pathname, /^\/etms_test(?:_[a-z0-9-]+)?$/);
  uri.pathname = `/etms_test_${new mongoose.Types.ObjectId()}`;
  process.env.JWT_SECRET = 'manual-api-only'; process.env.REDIS_URL = '';
  const analyzer = require('../../services/webAnalyzerService');
  t.mock.method(analyzer, 'validateTargetUrl', async (url) => new URL(url));
  const service = require('../../services/manualBrowserService');
  const calls = [];
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
  t.mock.method(service, 'requestBrowser', async (identity, method, route, body) => {
    calls.push({ identity, method, route, body });
    return new Response(route === '/screenshot' ? png : JSON.stringify({ status: method === 'DELETE' ? 'Ended' : 'Ready' }));
  });
  const { app } = require('../../server'); const m = require('../../models');
  await mongoose.connect(uri.toString());
  const server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
  let executionId;
  try {
    const role = await m.Role.create({ name: 'User', permissions: ['*'] });
    const owner = await m.User.create({ fullName: 'Manual Tester', email: 'manual@example.test', passwordHash: 'unused', role: role._id });
    const workspace = await m.Workspace.create({ name: 'Manual Workspace', slug: 'manual-test', owner: owner._id });
    const project = await m.Project.create({ name: 'Manual Project', key: 'MANUAL', workspace: workspace._id, lead: owner._id });
    const session = await m.UserSession.create({ user: owner._id, token: 'test-only', ipAddress: '127.0.0.1', expiresAt: new Date(Date.now() + 600000) });
    const token = jwt.sign({ id: owner._id, sessionId: session._id }, process.env.JWT_SECRET);
    const base = `http://127.0.0.1:${server.address().port}/api/v1`;
    const request = async (suffix, method = 'POST', body, status = 200, authenticated = true) => {
      const r = await fetch(`${base}/test-executions/${executionId}/manual-browser${suffix}`, { method, headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const json = await r.json(); assert.equal(r.status, status, JSON.stringify(json)); return json.data;
    };
    const suite = await m.TestSuite.create({ project: project._id, name: 'Manual suite', createdBy: owner._id });
    const environment = await m.TestEnvironment.create({ project: project._id, name: 'Fixture', targetUrl: 'https://fixture.example.test/', status: 'Ready', createdBy: owner._id });
    const testCase = await m.TestCase.create({ title: 'Login', testSuite: suite._id, status: 'Approved', createdBy: owner._id });
    const plan = await m.TestPlan.create({ name: 'Manual plan', project: project._id, kind: 'ExecutionPlan', approvalStatus: 'Draft', createdBy: owner._id });
    const run = await m.TestRun.create({ name: 'Manual run', testPlan: plan._id, executionMode: 'Manual', testEnvironment: environment._id, createdBy: owner._id });
    const execution = await m.TestExecution.create({ testRun: run._id, testCase: testCase._id, executionMode: 'Manual' }); executionId = String(execution._id);
    await request('', 'POST', {}, 401, false);
    await request('', 'POST', {}, 409);
    await m.TestPlan.updateOne({ _id: plan._id }, { approvalStatus: 'Approved' });
    await request('', 'POST', { targetUrl: 'https://attacker.example.test/' }, 201);
    assert.equal(calls.at(-1).body.targetUrl, environment.targetUrl);
    assert.equal(String(calls.at(-1).identity.userId), String(owner._id));
    assert.equal(String(calls.at(-1).identity.executionId), executionId);
    const saved = await request('/screenshot', 'POST', {}, 201);
    assert.ok((await m.TestExecution.findById(executionId)).evidence.includes(saved.url));
    assert.equal((await m.TestExecution.findById(executionId)).result, 'NotRun');
    const before = calls.length;
    await request('/input', 'POST', { events: [{ type: 'eval', script: 'no' }] }, 400);
    assert.equal(calls.length, before);
    await request('/input', 'POST', { events: [{ type: 'text', text: 'hello' }] });
    await m.TestExecution.updateOne({ _id: executionId }, { executionMode: 'Automation' });
    await request('', 'POST', {}, 409);
    await request('/screenshot', 'POST', {}, 409);
    await request('', 'DELETE');
    // Project membership is checked even for session cleanup/status.
    await m.Project.updateOne({ _id: project._id }, { workspace: new mongoose.Types.ObjectId(), lead: new mongoose.Types.ObjectId() });
    await m.Workspace.updateOne({ _id: workspace._id }, { owner: new mongoose.Types.ObjectId() });
    await m.ProjectMembership.deleteMany({ project: project._id });
    await m.WorkspaceMembership.deleteMany({ workspace: workspace._id });
    await request('', 'GET', undefined, 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (executionId) {
      const root = path.resolve('storage/execution-evidence'); const directory = path.resolve(root, executionId);
      if (path.dirname(directory) === root && /^[a-f0-9]{24}$/.test(executionId)) await fs.rm(directory, { recursive: true, force: true });
    }
    await mongoose.connection.dropDatabase(); await mongoose.disconnect();
  }
});
