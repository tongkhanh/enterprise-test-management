require('dotenv').config();
process.env.WEB_ANALYZER_ALLOW_PRIVATE = 'true';
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs').promises;
const path = require('node:path');
const {
  Project, TestSuite, TestCase, ReviewRequest, Notification,
  TestPlan, TestRun, TestExecution, AutomationResult, BoardItem, ProjectActivity,
} = require('../models');
const testDesign = require('../controllers/testDesignController');
const execution = require('../controllers/executionController');

const invoke = async (handler, req) => {
  let payload; let statusCode = 200;
  const res = { status(value) { statusCode = value; return this; }, json(value) { payload = value; return this; } };
  await handler(req, res);
  return { statusCode, payload };
};

const run = async () => {
  if (!process.env.MONGODB_URI) throw new Error('Thiếu MONGODB_URI.');
  await mongoose.connect(process.env.MONGODB_URI);
  const fixture = new mongoose.Types.ObjectId().toHexString().slice(-6).toUpperCase();
  const userId = new mongoose.Types.ObjectId(); const reviewerId = new mongoose.Types.ObjectId();
  const workspaceId = new mongoose.Types.ObjectId();
  const web = http.createServer((_, response) => {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end('<!doctype html><html><body><h1>Workflow fixture ready</h1></body></html>');
  });
  await new Promise((resolve) => web.listen(0, '127.0.0.1', resolve));
  const targetUrl = `http://127.0.0.1:${web.address().port}/`;
  let project; let suite; let cases = []; let review; let batch; let automationJobs = [];
  try {
    project = await Project.create({ name: `Workflow Fixture ${fixture}`, key: `WF${fixture}`, workspace: workspaceId, lead: userId, members: [userId, reviewerId] });
    suite = await TestSuite.create({ name: 'Approved cases', project: project._id, createdBy: userId });
    cases = await TestCase.create([1, 2].map((number) => ({
      title: `Approved automated case ${number}`, type: 'Automated', status: 'Draft',
      targetUrl, testSuite: suite._id, createdBy: userId,
      testSteps: [
        { stepNumber: 1, action: 'Mở website', expectedResult: 'Website hiển thị', automationAction: 'goto', value: targetUrl },
        { stepNumber: 2, action: 'Kiểm tra tiêu đề', expectedResult: 'Fixture sẵn sàng', automationAction: 'assertText', locator: { strategy: 'role', role: 'heading', name: 'Workflow fixture ready' }, value: 'Workflow fixture ready' },
      ],
    })));
    review = await ReviewRequest.create({ testCase: cases[0]._id, requestedBy: userId, reviewer: reviewerId });
    const approved = await invoke(testDesign.decideReview, {
      params: { id: String(review._id) }, body: { decision: 'Approved', reviewNote: 'Fixture approved' },
      user: { _id: reviewerId, fullName: 'QA Lead Fixture', role: { name: 'QA_Lead' } },
    });
    assert.equal(approved.statusCode, 200); assert.equal(approved.payload.data.testCase.status, 'Approved');
    await TestCase.findByIdAndUpdate(cases[1]._id, { status: 'Approved' });
    batch = await invoke(execution.createPlanFromApproved, {
      body: { project: String(project._id), testCaseIds: cases.map((item) => String(item._id)), name: `Batch ${fixture}`, environment: 'QA' },
      user: { _id: userId, role: { name: 'Admin' } },
    });
    assert.equal(batch.statusCode, 201); assert.equal(batch.payload.data.plan.testCases.length, 2); assert.equal(batch.payload.data.run.totalCases, 2); assert.equal(batch.payload.data.executions.length, 2);
    const persistedExecutions = await TestExecution.countDocuments({ testRun: batch.payload.data.run._id }); assert.equal(persistedExecutions, 2);
    const executionResponse = await invoke(execution.executeAutomatedRun, {
      params: { id: String(batch.payload.data.run._id) }, body: { browser: 'chromium', viewportWidth: 900, viewportHeight: 650 },
      user: { _id: userId, role: { name: 'Admin' } },
    });
    assert.equal(executionResponse.statusCode, 202); assert.equal(executionResponse.payload.data.jobs.length, 2);
    automationJobs = executionResponse.payload.data.jobs;
    const deadline = Date.now() + 30000; let results = [];
    while (Date.now() < deadline) {
      results = await AutomationResult.find({ _id: { $in: automationJobs.map((item) => item._id) } }).lean();
      if (results.length === 2 && results.every((item) => ['Passed', 'Failed', 'Error', 'Cancelled'].includes(item.status))) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.deepEqual(results.map((item) => item.status).sort(), ['Passed', 'Passed']);
    for (const result of results) {
      assert.ok(result.artifacts?.screenshot?.url); assert.ok(result.artifacts?.trace?.url);
      const folder = path.join(__dirname, '..', 'storage', 'automation', String(result._id));
      assert.ok(fs.existsSync(path.join(folder, 'passed.jpg'))); assert.ok(fs.existsSync(path.join(folder, 'trace.zip')));
    }
    let completedRun = null; const runDeadline = Date.now() + 5000;
    while (Date.now() < runDeadline) {
      completedRun = await TestRun.findById(batch.payload.data.run._id).lean();
      if (completedRun?.status === 'Completed') break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(completedRun.status, 'Completed'); assert.equal(completedRun.passedCount, 2); assert.equal(completedRun.failedCount, 0);
    console.log('OK: Draft → Approved → batch Plan/Run → 2 Playwright Passed với screenshot và trace.');
  } finally {
    const runIds = batch?.payload?.data?.run?._id ? [batch.payload.data.run._id] : [];
    const planIds = batch?.payload?.data?.plan?._id ? [batch.payload.data.plan._id] : [];
    if (automationJobs.length) {
      await AutomationResult.deleteMany({ _id: { $in: automationJobs.map((item) => item._id) } });
      for (const item of automationJobs) {
        const folder = path.resolve(__dirname, '..', 'storage', 'automation', String(item._id));
        const root = path.resolve(__dirname, '..', 'storage', 'automation');
        if (folder.startsWith(`${root}${path.sep}`)) await fsp.rm(folder, { recursive: true, force: true });
      }
    }
    if (runIds.length) { await TestExecution.deleteMany({ testRun: { $in: runIds } }); await TestRun.deleteMany({ _id: { $in: runIds } }); }
    if (planIds.length) await TestPlan.deleteMany({ _id: { $in: planIds } });
    await Notification.deleteMany({ $or: [{ recipient: userId }, { recipient: reviewerId }] });
    if (review?._id) await ReviewRequest.deleteOne({ _id: review._id });
    if (project?._id) await Promise.all([BoardItem.deleteMany({ project: project._id }), ProjectActivity.deleteMany({ project: project._id })]);
    if (cases.length) await TestCase.deleteMany({ _id: { $in: cases.map((item) => item._id) } });
    if (suite?._id) await TestSuite.deleteOne({ _id: suite._id });
    if (project?._id) await Project.deleteOne({ _id: project._id });
    await mongoose.disconnect(); await new Promise((resolve) => web.close(resolve));
  }
};

run().catch((error) => { console.error(error); process.exitCode = 1; });
