const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const Docker = require('dockerode');
const Modem = require('docker-modem');

const testUri = process.env.TEST_MONGODB_URI;

test('a Test Run records manual results and runs the reviewed script while retaining QA overrides', { skip: !testUri, timeout: 60000 }, async (t) => {
  const uri = new URL(testUri);
  assert.match(uri.pathname, /^\/etms_test(?:_[a-z0-9-]+)?$/);
  uri.pathname = `/etms_test_${new mongoose.Types.ObjectId()}`;
  process.env.MONGODB_URI = uri.toString();
  process.env.JWT_SECRET = 'test-run-workflow-only';
  process.env.REDIS_URL = '';

  const ai = require('../../services/aiService');
  const analyzer = require('../../services/webAnalyzerService');
  const queue = require('../../services/queueService');
  const url = 'https://example.test/login';
  let aiConfigured = false;
  t.mock.method(ai, 'isAiConfigured', () => aiConfigured);
  t.mock.method(ai, 'isEmbeddingConfigured', () => false);
  t.mock.method(ai, 'complete', async () => ({ text: JSON.stringify({ steps: [
    { action: 'click', control: 0 },
    { action: 'assertText', control: 1, value: 'Alternate login' },
  ] }) }));
  t.mock.method(analyzer, 'analyzeWebPage', async () => ({
    finalUrl: url, page: { inputs: [], buttons: [{ text: 'Alternate login', locator: { strategy: 'role', role: 'button', name: 'Alternate login' } }], links: [] },
  }));
  t.mock.method(queue, 'enqueueAutomationRun', async () => ({ id: 'integration-job' }));
  t.mock.method(Docker.prototype, 'pull', async () => ({}));
  t.mock.method(Modem.prototype, 'followProgress', (_stream, done) => done());
  t.mock.method(Docker.prototype, 'createContainer', async (options) => {
    const directory = options.HostConfig.Binds[0].slice(0, -'/workspace'.length - 1);
    const scriptName = options.Env.find((value) => value.startsWith('SCRIPT_FILE=')).slice('SCRIPT_FILE='.length);
    const code = await fs.readFile(path.join(directory, scriptName), 'utf8');
    assert.match(code, /Alternate login completed/);
    return {
      start: async () => {},
      wait: async () => ({ StatusCode: 1 }),
      logs: async () => Buffer.from('Expected alternate login confirmation was absent'),
      remove: async () => {},
    };
  });
  process.env.RUNNER_STORAGE_VOLUME = '';
  const { app } = require('../../server');
  const m = require('../../models');
  const { executeWithRetries } = require('../../services/multiEngineRunnerService');
  await mongoose.connect(uri.toString());
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  let automationRunId;
  try {
    const role = await m.Role.create({ name: 'User', permissions: ['*'] });
    const owner = await m.User.create({ fullName: 'Test Owner', email: 'owner@example.test', passwordHash: 'unused', role: role._id });
    const workspace = await m.Workspace.create({ name: 'Test Workspace', slug: 'test-workflow', owner: owner._id });
    const project = await m.Project.create({ name: 'Test Project', key: 'WORKFLOW', workspace: workspace._id, lead: owner._id });
    const session = await m.UserSession.create({ user: owner._id, token: 'workflow-test', ipAddress: '127.0.0.1', expiresAt: new Date(Date.now() + 600000) });
    const token = jwt.sign({ id: owner._id, sessionId: session._id }, process.env.JWT_SECRET);
    const request = async (route, method = 'GET', body, status = 200) => {
      const response = await fetch(base + route, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body && { body: JSON.stringify(body) }) });
      const json = await response.json();
      assert.equal(response.status, status, JSON.stringify(json));
      return json.data;
    };
    const environment = await m.TestEnvironment.create({ project: project._id, name: 'Test staging', targetUrl: url, status: 'Ready', autoAnalyze: false, createdBy: owner._id });
    const profile = await m.SystemProfile.create({ project: project._id, name: 'Login', mode: 'SystemProfile', environment: environment._id, createdBy: owner._id });
    const suite = await m.TestSuite.create({ project: project._id, name: 'Login Suite', createdBy: owner._id });
    const testCase = await m.TestCase.create({ title: 'Alternate login', type: 'Automated', status: 'Approved', testSuite: suite._id, createdBy: owner._id, e2e: { systemProfile: profile._id }, testSteps: [{ stepNumber: 1, action: 'Choose alternate login', expectedResult: 'Alternate login completed', automationAction: 'manual' }] });
    const plan = await m.TestPlan.create({ name: 'Execution Plan', project: project._id, kind: 'ExecutionPlan', approvalStatus: 'Approved', createdBy: owner._id, testCases: [testCase._id] });
    const manual = await request('/test-runs', 'POST', { testPlan: plan._id, name: 'Manual run' }, 201);
    const auto = await request('/test-runs', 'POST', { testPlan: plan._id, name: 'Auto run' }, 201);
    const manualDetail = await request(`/test-runs/${manual._id}`);
    const manualExecution = manualDetail.executions[0];
    assert.equal(manualExecution.runtimeUrl, url);
    await request(`/test-executions/${manualExecution._id}`, 'PATCH', { result: 'Failed', actualResult: 'Alternate login missing' });
    const { bug } = await request('/bugs', 'POST', { project: project._id, testExecution: manualExecution._id, title: 'Missing confirmation', description: 'No login confirmation', severity: 'Major', priority: 'Medium' }, 201);
    assert.equal(String((await m.TestExecution.findById(manualExecution._id)).bugReported), bug._id);
    assert.equal((await m.TestRun.findById(manual._id)).failedCount, 1);

    const execution = (await request(`/test-runs/${auto._id}`)).executions[0];
    const draft = await request('/automation-scripts', 'POST', { testCase: testCase._id, engine: 'Playwright' }, 201);
    assert.equal(draft.status, 'Generated');
    assert.ok(draft.generationNote);
    assert.equal((await request(`/automation-scripts/${draft._id}/validate`, 'POST', { code: draft.code })).status, 'Generated');
    aiConfigured = true;
    const generated = await request('/automation-scripts', 'POST', { testCase: testCase._id, engine: 'Playwright' }, 201);
    assert.match(generated.code, /getByRole\("button"/);
    assert.doesNotMatch(generated.code, /TODO manual/);
    assert.equal((await m.TestCase.findById(testCase._id)).testSteps[0].automationAction, 'manual');
    await request(`/test-executions/${execution._id}/auto`, 'POST', { scriptId: generated._id }, 409);
    const code = generated.code.replace('toContainText("Alternate login")', 'toContainText("Alternate login completed")');
    const validated = await request(`/automation-scripts/${generated._id}/validate`, 'POST', { code });
    assert.equal(validated.status, 'Validated');
    await request(`/automation-scripts/${generated._id}/review`, 'PATCH', { status: 'Approved' });
    const queued = await request(`/test-executions/${execution._id}/auto`, 'POST', { scriptId: generated._id }, 202);
    automationRunId = queued._id;
    await request(`/test-executions/${execution._id}/auto`, 'POST', { scriptId: generated._id }, 409);
    await request(`/test-executions/${execution._id}`, 'PATCH', { result: 'Passed', actualResult: 'QA verified alternate login' });
    await executeWithRetries(automationRunId);
    const detail = await request(`/test-runs/${auto._id}`);
    assert.equal(detail.run.passedCount, 1);
    assert.equal(detail.executions[0].qaVerdict, 'Passed');
    assert.equal(detail.executions[0].result, 'Passed');
    assert.equal(detail.executions[0].automationRun.status, 'Failed');
    assert.equal(detail.automationJobs[0].status, 'Failed');
    assert.ok(detail.automationJobs[0].artifacts.Log[0].url);
    const reported = await request('/bugs', 'POST', { project: project._id, testExecution: execution._id, title: 'Runner discrepancy', description: 'Runner did not see the confirmation', severity: 'Minor', priority: 'Low' }, 201);
    assert.equal(reported.bug.automationResult, detail.automationJobs[0]._id);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (/^[a-f0-9]{24}$/.test(automationRunId || '')) {
      const root = path.resolve(__dirname, '../../storage/multi-engine');
      const directory = path.resolve(root, automationRunId);
      if (path.dirname(directory) === root) await fs.rm(directory, { recursive: true, force: true });
    }
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
