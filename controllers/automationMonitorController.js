const fs = require('node:fs/promises');
const path = require('node:path');
const { TestExecution, TestRun, TestCase, TestEnvironment, AutomationScript, AutomationRun, UserSession } = require('../models');
const { getById, send, AppError } = require('../utils/http');
const { assertProjectAccess } = require('../services/projectAccessService');
const { resolveCaseRuntime } = require('../services/e2eRuntimeService');
const { isScriptCurrent } = require('../services/automationScriptService');
const resources = require('../services/automationResourcesService');
const { Dataset, Fixture } = require('../models/execution-automation/AutomationResources');
const { writeEvent } = require('../manual-browser/protocol');

async function access(req) {
  const execution = await getById(TestExecution, req.params.id);
  const run = await getById(TestRun, execution.testRun, 'testPlan');
  await assertProjectAccess(req.user, run.testPlan.project);
  return { execution, run };
}
const preflight = async (req, res) => {
  for (const field of ['scriptId', 'dataset', 'fixture']) if (req.query[field] && !/^[a-f0-9]{24}$/.test(req.query[field])) throw new AppError(`${field} không hợp lệ.`, 400);
  const { execution, run } = await access(req);
  const testCase = await getById(TestCase, execution.testCase);
  const checks = [];
  const check = (name, ready, detail) => checks.push({ name, ready: Boolean(ready), detail });
  check('Run', run.executionMode === 'Automation' && execution.executionMode === 'Automation', 'Chọn Automation Run; Manual và Automation được thực thi riêng.');
  check('Execution Plan', run.testPlan.kind !== 'ExecutionPlan' || run.testPlan.approvalStatus === 'Approved', 'QA Manager duyệt Execution Plan trước khi chạy.');
  check('Test Case', ['Approved', 'Active'].includes(testCase.status) && !testCase.quarantined, 'Test Case phải được duyệt và không bị quarantine.');
  const runtime = await resolveCaseRuntime(testCase);
  const environmentId = run.testEnvironment || runtime?.environmentId;
  const environment = environmentId ? await TestEnvironment.findById(environmentId) : null;
  check('Environment', environment?.status === 'Ready' && String(environment.project) === String(run.testPlan.project), 'Gắn Environment Ready thuộc Project.');
  const scriptId = req.query.scriptId || execution.automationScript;
  const script = scriptId ? await AutomationScript.findById(scriptId) : null;
  check('Script', script?.status === 'Approved' && String(script?.testCase) === String(testCase._id) && String(script?.project) === String(run.testPlan.project) && isScriptCurrent(script, testCase) && (!script.runtimeUrl || script.runtimeUrl === environment?.targetUrl), 'Sinh/chỉnh script → Validate → QA duyệt; script phải khớp Test Case và URL hiện tại.');
  let dataReady = true;
  try {
    if (req.query.dataset && !await Dataset.exists({ _id: req.query.dataset, project: run.testPlan.project })) throw new Error();
    if (req.query.fixture && !await Fixture.exists({ _id: req.query.fixture, project: run.testPlan.project, environment: environment?._id })) throw new Error();
    if (script && environment) resources.substitute(script.code, await resources.runtimeData({ environment: environment._id, dataset: req.query.dataset }), script.engine);
  } catch { dataReady = false; }
  check('Test Data / Fixture', dataReady, 'Bổ sung dataset/secret còn thiếu; fixture phải thuộc Environment đang chọn.');
  const history = await AutomationRun.find({ testExecution: execution._id }).sort({ createdAt: -1 }).limit(20).select('_id status attempt engine startedAt completedAt createdAt').lean();
  check('Runner', !history.some((item) => ['Queued', 'Preparing', 'Running', 'Collecting'].includes(item.status)), 'Đợi lượt chạy đang hoạt động kết thúc trước khi Retest.');
  send(res, { ready: checks.every((item) => item.ready), checks, history, scriptId: script?._id });
};
// Files are produced by a test script container. Never follow its symlinks out of the attempt.
async function readBounded(directory, name, limit) {
  try {
    const file = path.join(directory, name); const real = await fs.realpath(file);
    if (!real.startsWith(`${path.resolve(directory)}${path.sep}`)) return null;
    const stat = await fs.stat(real); if (!stat.isFile() || stat.size > limit) return null;
    return await fs.readFile(real);
  } catch { return null; }
}
const stream = async (req, res) => {
  if (req.query.run && !/^[a-f0-9]{24}$/.test(req.query.run)) throw new AppError('Run không hợp lệ.', 400);
  const { execution, run } = await access(req);
  const selectedId = req.query.run || execution.automationRun;
  const automation = selectedId ? await AutomationRun.findOne({ _id: selectedId, testExecution: execution._id, project: run.testPlan.project }).lean() : null;
  if (!automation) throw new AppError('Chưa có lượt chạy Automation.', 404);
  const selectedAttempt = Number(req.query.attempt || automation.attempt || 1);
  if (!Number.isInteger(selectedAttempt) || selectedAttempt < 1 || selectedAttempt > Math.max(automation.attempt, 1)) throw new AppError('Attempt không hợp lệ.', 400);
  res.status(200).set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' }); res.flushHeaders();
  let closed = false; res.on('close', () => { closed = true; });
  let lastFrame; let lastState; let lastCheck = 0; let lastAuth = Date.now(); let current = automation;
  const root = path.resolve('storage/multi-engine', String(automation._id));
  while (!closed) {
    if (Date.now() - lastAuth >= 30000) {
      try {
        if (!await UserSession.exists({ _id: req.sessionId, user: req.user._id, isActive: true })) break;
        await assertProjectAccess(req.user, run.testPlan.project);
      } catch { break; }
      lastAuth = Date.now();
    }
    if (Date.now() - lastCheck >= 2000) { current = await AutomationRun.findById(automation._id).select('status attempt engine startedAt completedAt').lean(); lastCheck = Date.now(); }
    if (!current) break;
    const attempt = req.query.attempt ? selectedAttempt : current.attempt || 1;
    const directory = path.join(root, `attempt-${attempt}`);
    const stateBuffer = await readBounded(directory, '.etms-live/state.json', 100000);
    let state; try { state = JSON.parse(stateBuffer); } catch { state = null; }
    const historical = Boolean(req.query.attempt && attempt < current.attempt);
    const snapshot = JSON.stringify({ status: historical ? state?.status || 'Unknown' : current.status, engine: current.engine, attempt, startedAt: historical ? state?.startedAt : current.startedAt, completedAt: historical ? state?.completedAt : current.completedAt, progress: state });
    if (snapshot !== lastState) { writeEvent(res, 'state', JSON.parse(snapshot)); lastState = snapshot; }
    const frame = await readBounded(directory, '.etms-live/frame.jpg', 1500000);
    if (frame && !frame.equals(lastFrame || Buffer.alloc(0))) { writeEvent(res, 'frame', { data: frame.toString('base64') }); lastFrame = frame; }
    if (!['Queued', 'Preparing', 'Running', 'Collecting'].includes(current.status) || (req.query.attempt && attempt < current.attempt)) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  res.end();
};
module.exports = { preflight, stream, readBounded };
