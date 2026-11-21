const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const { TestExecution, TestRun, TestCase, TestEnvironment, UserSession } = require('../models');
const { getById, AppError, send } = require('../utils/http');
const { assertProjectAccess } = require('../services/projectAccessService');
const { resolveCaseRuntime } = require('../services/e2eRuntimeService');
const { validateTargetUrl } = require('../services/webAnalyzerService');
const { validateInput, waitForDrain } = require('../manual-browser/protocol');
const browser = require('../services/manualBrowserService');

async function access(req, { starting = false } = {}) {
  const execution = await getById(TestExecution, req.params.id);
  const run = await getById(TestRun, execution.testRun, 'testPlan');
  await assertProjectAccess(req.user, run.testPlan.project);
  if (starting) {
    const mode = execution.executionMode || run.executionMode || 'Manual';
    if (mode !== 'Manual') throw new AppError('Chỉ Manual Run được mở phiên trình duyệt thủ công.', 409);
    if (run.testPlan.kind === 'ExecutionPlan' && run.testPlan.approvalStatus !== 'Approved') throw new AppError('QA Manager cần duyệt Execution Plan trước khi chạy.', 409);
  }
  return { execution, run, identity: { userId: req.user._id, executionId: execution._id } };
}
const start = async (req, res) => {
  const { execution, run, identity } = await access(req, { starting: true });
  const testCase = await getById(TestCase, execution.testCase);
  let targetUrl;
  if (run.testEnvironment) {
    const environment = await getById(TestEnvironment, run.testEnvironment);
    if (String(environment.project) !== String(run.testPlan.project) || environment.status !== 'Ready') throw new AppError('Test Environment chưa Ready hoặc không thuộc Project.', 409);
    targetUrl = environment.targetUrl;
  } else targetUrl = (await resolveCaseRuntime(testCase))?.targetUrl;
  if (!targetUrl) throw new AppError('Gắn môi trường chạy trước khi bắt đầu Manual Test.', 409);
  await validateTargetUrl(targetUrl);
  send(res, await (await browser.requestBrowser(identity, 'POST', '/session', { targetUrl })).json(), 201);
};
const status = async (req, res) => { const { identity } = await access(req); send(res, await (await browser.requestBrowser(identity, 'GET', '/session')).json()); };
const end = async (req, res) => { const { identity } = await access(req); send(res, await (await browser.requestBrowser(identity, 'DELETE', '/session')).json()); };
const input = async (req, res) => {
  const { identity } = await access(req, { starting: true });
  try { validateInput(req.body.events); } catch (error) { throw new AppError(error.message, 400); }
  send(res, await (await browser.requestBrowser(identity, 'POST', '/input', { events: req.body.events })).json());
};
const screenshot = async (req, res) => {
  const { identity, execution } = await access(req, { starting: true });
  const response = await browser.requestBrowser(identity, 'GET', '/screenshot');
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > 10 * 1024 * 1024 || !buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) throw new AppError('Ảnh evidence không hợp lệ.', 502);
  const directory = path.resolve('storage', 'execution-evidence', String(execution._id));
  const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}-manual-browser.png`;
  await fs.mkdir(directory, { recursive: true }); await fs.writeFile(path.join(directory, filename), buffer, { flag: 'wx' });
  const url = `/api/v1/test-executions/${execution._id}/evidence/${filename}`;
  await TestExecution.updateOne({ _id: execution._id }, { $push: { evidence: url } });
  send(res, { url }, 201);
};
const stream = async (req, res) => {
  const { identity, run } = await access(req, { starting: true });
  const abort = new AbortController(); res.on('close', () => abort.abort());
  const response = await browser.requestBrowser(identity, 'GET', '/stream', undefined, { signal: abort.signal });
  res.status(200).set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' }); res.flushHeaders();
  // Revalidate long-lived viewers after logout or project access changes.
  const verify = setInterval(async () => {
    try {
      if (!await UserSession.exists({ _id: req.sessionId, user: req.user._id, isActive: true })) throw new Error();
      await assertProjectAccess(req.user, run.testPlan.project);
    } catch { abort.abort(); res.end(); }
  }, 30000); verify.unref();
  try {
    for await (const chunk of response.body) {
      if (abort.signal.aborted) break;
      if (!res.write(chunk)) await waitForDrain(res);
    }
  } catch { /* disconnect/reconnect preserves the remote browser */ }
  finally { clearInterval(verify); res.end(); }
};
module.exports = { start, status, end, input, screenshot, stream };
