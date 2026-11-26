const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const testUri = process.env.TEST_MONGODB_URI;
test('Bug approval creates Jira issues using the verified project connection and pins later syncs', { skip: !testUri, timeout: 60000 }, async (t) => {
  const uri = new URL(testUri);
  assert.match(uri.pathname, /^\/etms_test(?:_[a-z0-9-]+)?$/);
  uri.pathname = `/etms_test_${new mongoose.Types.ObjectId()}`;
  Object.assign(process.env, { MONGODB_URI: uri.toString(), JWT_SECRET: 'jira-approval-test-only', REDIS_URL: '', NODE_ENV: 'test', JIRA_BASE_URL: 'https://legacy.example.test', JIRA_EMAIL: 'wrong@example.test', JIRA_API_TOKEN: 'legacy-token', JIRA_PROJECT_KEY: 'WRONG' });
  const ai = require('../../services/aiService');
  t.mock.method(ai, 'isEmbeddingConfigured', () => false);
  const realFetch = global.fetch;
  const outbound = []; let jiraFails = false;
  let entered, release; let holdResponse = false;
  t.mock.method(global, 'fetch', async (url, options = {}) => {
    if (String(url).startsWith('http://127.0.0.1:')) return realFetch(url, options);
    assert.equal(String(url), 'https://jira.example.test/rest/api/3/issue', 'no cross-project or legacy destination');
    const [email, token] = Buffer.from(options.headers.Authorization.slice(6), 'base64').toString().split(':');
    assert.equal(email, 'owner@example.test'); assert.equal(token, 'project-token');
    assert.equal(options.method, 'POST');
    const body = JSON.parse(options.body); outbound.push(body);
    assert.equal(body.fields.project.key, 'QA'); assert.equal(body.fields.issuetype.name, 'Bug');
    assert.match(JSON.stringify(body), /Expected: Expected outcome/);
    assert.match(JSON.stringify(body), /Actual: Observed failure/);
    assert.match(JSON.stringify(body), /Root cause do QA xác nhận/);
    assert.doesNotMatch(JSON.stringify(body), /AI confidence|automation-failure/);
    if (holdResponse) { entered(); await new Promise(resolve => { release = resolve; }); }
    return new Response(JSON.stringify(jiraFails ? { errorMessages: ['Rejected fixture project-token'] } : { id: '10001', key: 'QA-1' }), { status: jiraFails ? 400 : 201 });
  });
  const { app } = require('../../server'); const m = require('../../models');
  const { encryptCredential } = require('../../services/integrationCredentialService');
  await mongoose.connect(uri.toString());
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  try {
    const role = await m.Role.create({ name: 'User', permissions: ['*'] });
    const owner = await m.User.create({ fullName: 'Jira Owner', email: 'owner@example.test', passwordHash: 'unused', role: role._id });
    const workspace = await m.Workspace.create({ name: 'Jira workspace', slug: 'jira-approval-test', owner: owner._id });
    const project = await m.Project.create({ name: 'Jira project', key: 'JIRA', workspace: workspace._id, lead: owner._id });
    const other = await m.Project.create({ name: 'Other project', key: 'OTHER', workspace: workspace._id, lead: owner._id });
    const session = await m.UserSession.create({ user: owner._id, token: 'jira-test-only', ipAddress: '127.0.0.1', expiresAt: new Date(Date.now() + 600000) });
    const token = jwt.sign({ id: owner._id, sessionId: session._id }, process.env.JWT_SECRET);
    const request = async (path, method, body, status = 200, auth = token) => {
      const response = await fetch(base + path, { method, headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await response.json(); assert.equal(response.status, status, JSON.stringify(json));
      assert.ok(!JSON.stringify(json).includes('project-token'), 'credentials stay out of API responses');
      return json.data;
    };
    const newBug = async (extra = {}) => (await request('/bugs', 'POST', { title: '[WORKFLOW TEST] Jira fixture', description: 'Synthetic approval test', project: project._id, severity: 'Major', priority: 'Medium', approvalStatus: 'PendingApproval', jiraRequested: true, stepsToReproduce: 'Open test page', expectedResult: 'Expected outcome', actualResult: 'Observed failure', rootCause: { summary: 'QA reviewed fixture', suggestedByAi: false, reviewStatus: 'Accepted' }, ...extra }, 201)).bug;
    const decide = (bug, decision, status = 200) => request(`/bugs/${bug._id}/decision`, 'PATCH', { decision, reviewNote: 'Synthetic QA review' }, status);
    const connectionData = { provider: 'Jira', displayName: 'Fixture Jira', workspace: workspace._id, project: project._id, baseUrl: 'https://jira.example.test', externalProjectKey: 'QA', settings: { accountEmail: 'owner@example.test' }, credentialCiphertext: encryptCredential('project-token'), createdBy: owner._id };
    // Another project's credentials, and environment credentials, must not be used.
    await m.IntegrationConnection.create({ ...connectionData, project: other._id, status: 'Connected' });
    const bug = await newBug();
    assert.equal(outbound.length, 0, 'creating a pending Bug sends nothing to Jira');
    const outsider = await m.User.create({ fullName: 'Outside User', email: 'outside@example.test', passwordHash: 'unused', role: role._id });
    const outsideSession = await m.UserSession.create({ user: outsider._id, token: 'outside-test', ipAddress: '127.0.0.1', expiresAt: new Date(Date.now() + 600000) });
    const outsideToken = jwt.sign({ id: outsider._id, sessionId: outsideSession._id }, process.env.JWT_SECRET);
    await request(`/bugs/${bug._id}/decision`, 'PATCH', { decision: 'Approved' }, 403, outsideToken);
    assert.equal(outbound.length, 0, 'a user without project access cannot trigger Jira creation');
    await decide(bug, 'Approved', 409);
    assert.equal(outbound.length, 0);
    assert.equal((await m.Bug.findById(bug._id)).approvalStatus, 'PendingApproval');
    const connection = await m.IntegrationConnection.create({ ...connectionData, status: 'Configured' });
    await decide(bug, 'Approved', 409);
    await m.IntegrationConnection.updateOne({ _id: connection._id }, { status: 'Connected', lastTestedAt: new Date() });
    // A failed Jira call leaves approval pending so the same request can be retried.
    jiraFails = true;
    await decide(bug, 'Approved', 502);
    assert.equal((await m.Bug.findById(bug._id)).approvalStatus, 'PendingApproval');
    const failedLog = await m.IntegrationSyncLog.findOne({ integration: connection._id, action: 'CreateIssue', status: 'Failed' });
    assert.ok(failedLog); assert.doesNotMatch(failedLog.error, /project-token/);
    jiraFails = false;
    const approved = await decide(bug, 'Approved');
    assert.equal(approved.approvalStatus, 'Approved'); assert.equal(approved.status, 'New');
    assert.equal(approved.externalIssue.key, 'QA-1');
    assert.equal(approved.externalIssue.url, 'https://jira.example.test/browse/QA-1');
    assert.equal(approved.externalIssue.integration, String(connection._id));
    assert.ok(await m.IntegrationSyncLog.exists({ integration: connection._id, action: 'CreateIssue', status: 'Success' }));
    let count = outbound.length;
    await decide(bug, 'Approved', 409);
    await decide(await newBug(), 'Rejected');
    await decide(await newBug({ jiraRequested: false }), 'Approved');
    assert.equal(outbound.length, count, 'repeated approval, rejection and internal-only Bugs create no issue');
    // Concurrent approval clicks must not create two external issues.
    const concurrentBug = await newBug();
    holdResponse = true;
    const started = new Promise(resolve => { entered = resolve; });
    const firstApproval = decide(concurrentBug, 'Approved');
    await started;
    try { await decide(concurrentBug, 'Approved', 409); } finally { holdResponse = false; release(); }
    await firstApproval;
    assert.equal(outbound.length, count + 1);
    count = outbound.length;
    assert.equal((await m.Bug.findById(concurrentBug._id)).approvalStatus, 'Approved');
    // A later connection must not silently take over an already-linked issue.
    await m.IntegrationConnection.create({ ...connectionData, status: 'Connected', lastTestedAt: new Date(Date.now() + 10000) });
    let syncJob;
    t.mock.method(require('../../services/queueService'), 'enqueueIntegration', async (_name, data) => { syncJob = data; return { id: 'fixture-job' }; });
    await require('../../services/integrationSyncService').enqueueJiraBugSync({ bugId: bug._id, userId: owner._id });
    assert.equal(String(syncJob.integrationId), String(connection._id));
    await m.IntegrationConnection.updateOne({ _id: connection._id }, { status: 'Disconnected' });
    assert.equal(await require('../../services/integrationSyncService').enqueueJiraBugSync({ bugId: bug._id, userId: owner._id }), null);
    assert.equal(outbound.length, count);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await mongoose.connection.dropDatabase(); await mongoose.disconnect();
  }
});
