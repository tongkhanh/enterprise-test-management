const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const ExcelJS = require('exceljs');

const testUri = process.env.TEST_MONGODB_URI;

test('reports distinguish execution modes and retries, and exports resolve the current runtime', { skip: !testUri, timeout: 60000 }, async (t) => {
  const uri = new URL(testUri);
  assert.match(uri.pathname, /^\/etms_test(?:_[a-z0-9-]+)?$/);
  uri.pathname = `/etms_test_${new mongoose.Types.ObjectId()}`;
  process.env.MONGODB_URI = uri.toString();
  process.env.JWT_SECRET = 'report-runtime-export-only';
  process.env.REDIS_URL = '';
  const ai = require('../../services/aiService');
  let reportInput;
  t.mock.method(ai, 'complete', async ({ prompt }) => {
    reportInput = JSON.parse(prompt.slice(prompt.indexOf('\n') + 1));
    return { text: JSON.stringify({
      reportId: 'TR-20231024', title: 'Login summary', executiveSummary: 'Two manual tests',
      environment: 'environment binding pending',
      scope: ['Login'], highlights: [], risks: [], recommendations: [], releaseRecommendation: 'Go',
    }) };
  });
  const { app } = require('../../server');
  const m = require('../../models');
  await mongoose.connect(uri.toString());
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  try {
    const role = await m.Role.create({ name: 'User', permissions: ['*'] });
    const owner = await m.User.create({ fullName: 'Report Owner', email: 'reports@example.test', passwordHash: 'unused', role: role._id });
    const workspace = await m.Workspace.create({ name: 'Reports Workspace', slug: 'reports', owner: owner._id });
    const project = await m.Project.create({ name: 'Reports Project', key: 'REPORTS', workspace: workspace._id, lead: owner._id });
    const session = await m.UserSession.create({ user: owner._id, token: 'reports-test', ipAddress: '127.0.0.1', expiresAt: new Date(Date.now() + 600000) });
    const token = jwt.sign({ id: owner._id, sessionId: session._id }, process.env.JWT_SECRET);
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const request = async (route, method = 'GET', body, status = 200) => {
      const response = await fetch(base + route, { method, headers, ...(body && { body: JSON.stringify(body) }) });
      const json = await response.json();
      assert.equal(response.status, status, JSON.stringify(json));
      return json.data;
    };
    const oldUrl = 'https://old.example.test/';
    const url = 'https://current.example.test/';
    const environment = await m.TestEnvironment.create({ project: project._id, name: 'Current staging', status: 'Ready', targetUrl: url, createdBy: owner._id });
    const profile = await m.SystemProfile.create({ project: project._id, name: 'Login scope', mode: 'SystemProfile', environment: environment._id, baseUrl: oldUrl, createdBy: owner._id });
    const suite = await m.TestSuite.create({ project: project._id, name: 'Login suite', systemProfile: profile._id, createdBy: owner._id });
    const cases = await m.TestCase.insertMany(['Login succeeds', 'Incorrect password'].map((title, index) => ({
      testCaseId: `TC-LOGIN-${index + 1}`, title, type: 'Automated', status: 'Approved',
      testSuite: suite._id, targetUrl: oldUrl, createdBy: owner._id, e2e: { systemProfile: profile._id },
      testSteps: [{ stepNumber: 1, action: 'Check login', expectedResult: 'Expected login outcome' }],
    })));
    const plan = await m.TestPlan.create({ name: 'Login plan', project: project._id, kind: 'ExecutionPlan', approvalStatus: 'Approved', testCases: cases.map((item) => item._id), createdBy: owner._id });
    const run = await m.TestRun.create({ name: 'Manual and Auto run', testPlan: plan._id, status: 'Completed', environment: 'environment binding pending', totalCases: 2, passedCount: 2, createdBy: owner._id });
    const executions = await m.TestExecution.insertMany(cases.map((item) => ({
      testRun: run._id, testCase: item._id, result: 'Passed', qaVerdict: 'Passed',
      executedAt: new Date(), executedBy: owner._id,
    })));
    const previous = await m.AutomationResult.create({ project: project._id, suiteName: 'Login', framework: 'Playwright', status: 'Error', testRun: run._id, testExecution: executions[1]._id, testCase: cases[1]._id, targetUrl: url });
    const latest = await m.AutomationResult.create({ project: project._id, suiteName: 'Login', framework: 'Playwright', status: 'Passed', testRun: run._id, testExecution: executions[1]._id, testCase: cases[1]._id, targetUrl: url, testEnvironment: environment._id });
    const automationRun = await m.AutomationRun.create({
      project: project._id, testCase: cases[1]._id, testExecution: executions[1]._id, result: latest._id,
      environment: environment._id, script: new mongoose.Types.ObjectId(), engine: 'Playwright',
      status: 'Passed', requestedBy: owner._id, targetUrl: url,
    });
    await m.TestExecution.updateOne({ _id: executions[1]._id }, { automationRun: automationRun._id });
    const report = await request(`/test-runs/${run._id}/reports/suggest`, 'POST', {}, 201);
    assert.equal(report.metrics.manual, 1);
    assert.equal(report.metrics.auto, 1);
    assert.equal(report.metrics.passed, 2);
    assert.equal(report.metrics.failed, 0);
    assert.equal(report.environment, url);
    assert.match(report.executiveSummary, /1 Manual, 1 Auto/);
    assert.match(report.executiveSummary, /Error.*runner mới nhất Passed/);
    assert.doesNotMatch(report.reportId, /20231024/);
    assert.match(report.reportId, /^TR-\d{8}-[a-f0-9]{8}$/);
    assert.equal(reportInput.run.environment, url);
    assert.equal(reportInput.executions[1].latestRunnerStatus, 'Passed');
    assert.deepEqual(reportInput.executions[1].previousAttempts, [{ status: 'Error', framework: 'Playwright' }]);
    assert.equal(report.executionDetails[0].mode, 'Manual');
    assert.equal(report.executionDetails[1].mode, 'Auto');
    assert.equal(report.status, 'PendingApproval');

    const readWorkbook = async (route, method, body) => {
      const response = await fetch(base + route, { method, headers, ...(body && { body: JSON.stringify(body) }) });
      assert.equal(response.status, 200);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()));
      return workbook;
    };
    const batch = await readWorkbook('/test-cases/export', 'POST', { testCaseIds: cases.map((item) => item._id) });
    assert.deepEqual(batch.worksheets.map((sheet) => sheet.name), ['Test Cases', 'Steps', 'Test Data', 'Traceability']);
    assert.equal(batch.getWorksheet('Test Cases').getCell('M2').value, url);
    assert.equal(batch.getWorksheet('Test Cases').getCell('M3').value, url);
    const single = await readWorkbook(`/e2e-artifacts/test-case/${cases[0]._id}/export?format=xlsx`, 'GET');
    assert.equal(single.getWorksheet('Test Cases').getCell('M2').value, url);
    assert.equal((await m.TestCase.findById(cases[0]._id)).targetUrl, oldUrl);
    assert.equal((await m.TestCase.findById(cases[0]._id)).status, 'Approved');

    await m.TestExecution.updateOne({ _id: executions[1]._id }, { result: 'Failed', qaVerdict: 'Failed' });
    const override = await request(`/test-runs/${run._id}/reports/suggest`, 'POST', {}, 201);
    assert.equal(override.metrics.passed, 1);
    assert.equal(override.metrics.failed, 1);
    assert.match(override.executiveSummary, /QA kết luận Failed, runner mới nhất Passed/);
    assert.notEqual(override.reportId, report.reportId);
    await m.AutomationResult.updateOne({ _id: previous._id }, { targetUrl: oldUrl });
    await m.TestEnvironment.updateOne({ _id: environment._id }, { status: 'Stopped' });
    const stopped = await readWorkbook('/test-cases/export', 'POST', { testCaseIds: cases.map((item) => item._id) });
    assert.equal(stopped.getWorksheet('Test Cases').getCell('M2').value, '');
    assert.equal(stopped.getWorksheet('Test Cases').getCell('M3').value, '');
    const historical = await request(`/test-runs/${run._id}/reports/suggest`, 'POST', {}, 201);
    assert.ok(historical.environment.includes(url));
    assert.ok(!historical.environment.includes(oldUrl));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
