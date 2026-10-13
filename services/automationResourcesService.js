const crypto = require('node:crypto');
const cron = require('node-cron');
const { Dataset, Fixture, Schedule, Health } = require('../models/execution-automation/AutomationResources');
const { AutomationScript, TestCase, TestEnvironment, EnvironmentSecret, AutomationRun, Notification } = require('../models');
const { encryptCredential, decryptCredential } = require('./integrationCredentialService');
const { normalizeMatrix } = require('./automationPolicyService');
const { assertProjectAccess } = require('./projectAccessService');
const { AppError } = require('../utils/http');

async function checkResource(Model, id, project) {
  if (!id) return null;
  const item = await Model.findById(id);
  if (!item || String(item.project) !== String(project)) throw new AppError('Tài nguyên không thuộc Project.', 409);
  return item;
}
async function createBatch({ project, scripts, environment, dataset, fixture, matrix, user, schedule }) {
  await assertProjectAccess(user, project, { permission: 'execution:execute' });
  const env = await checkResource(TestEnvironment, environment, project);
  if (!env || env.status !== 'Ready') throw new AppError('Environment phải Ready.', 409);
  const data = await checkResource(Dataset, dataset, project);
  const setup = await checkResource(Fixture, fixture, project);
  if (setup && String(setup.environment) !== String(environment)) throw new AppError('Fixture không thuộc Environment này.', 409);
  const targets = normalizeMatrix(matrix);
  if (!Array.isArray(scripts) || !scripts.length || scripts.length > 100) throw new AppError('Chọn 1–100 script.', 400);
  const selected = await AutomationScript.find({ _id: { $in: scripts }, project, status: 'Approved' });
  if (selected.length !== new Set(scripts.map(String)).size) throw new AppError('Mọi script phải thuộc Project và đã Approved.', 409);
  const rowCount = data?.rowCount || 1;
  if (selected.length * targets.length * rowCount > 500) throw new AppError('Một batch tối đa 500 jobs.', 400);
  const groupId = crypto.randomUUID(); const runs = [];
  for (const script of selected) for (const target of targets) if (script.engine !== 'Playwright' && (target.browser !== 'chromium' || target.device)) throw new AppError('Matrix mobile/Firefox/WebKit hiện yêu cầu Playwright.', 422);
  for (const script of selected) {
    const tc = await TestCase.findById(script.testCase);
    if (tc?.quarantined) continue;
    for (const target of targets) {
      if (script.engine !== 'Playwright' && (target.browser !== 'chromium' || target.device)) throw new AppError('Matrix mobile/Firefox/WebKit hiện yêu cầu Playwright.', 422);
      for (let dataRow = 0; dataRow < rowCount; dataRow += 1) runs.push(await require('./multiEngineRunnerService').createAutomationRun({ scriptId: script._id, environmentId: environment, userId: user._id, dataset, fixture, matrix: target, dataRow, groupId, schedule, triggeredBy: schedule ? 'Scheduled' : 'Manual' }));
    }
  }
  return { groupId, runs };
}
async function runtimeData(run) {
  const dataset = run.dataset ? await Dataset.findById(run.dataset).select('+encryptedRows') : null;
  const rows = dataset ? JSON.parse(decryptCredential(dataset.encryptedRows)) : [{}];
  const secrets = await EnvironmentSecret.find({ environment: run.environment }).select('+valueCiphertext');
  const values = { ...(rows[run.dataRow] || {}), ...Object.fromEntries(secrets.map((x) => [`secret:${x.name}`, decryptCredential(x.valueCiphertext)])) };
  for (const [key, value] of Object.entries(values)) if (typeof value === 'string' && value.startsWith('$secret:')) { const reference = value.slice(1); if (!(reference in values)) throw new AppError(`Secret chưa được cấu hình: ${reference}`, 422); values[key] = values[reference]; }
  return values;
}
function substitute(code, values, engine) {
  if (engine === 'RobotFramework') return code.replace(/\$\{data:([\w:.-]+)\}/g, (_, key) => { if (!(key in values)) throw new AppError(`Thiếu biến dataset/secret: ${key}`, 422); return String(values[key]).replace(/[\r\n\t]/g, ' ').replace(/ {2,}/g, ' '); });
  return code.replace(/"\$([\w:.-]+)"/g, (_, key) => { if (!(key in values)) throw new AppError(`Thiếu biến dataset/secret: ${key}`, 422); return JSON.stringify(String(values[key])); });
}
async function applyFixture(fixtureId, stage, targetUrl, values) {
  if (!fixtureId) return;
  const fixture = await Fixture.findById(fixtureId);
  const origin = new URL(targetUrl).origin;
  for (const step of fixture?.[stage] || []) {
    const url = new URL(step.path, origin);
    if (url.origin !== origin || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(step.method)) throw new AppError('Fixture chỉ gọi endpoint trên cùng application.', 400);
    const bind = (value) => {
      if (Array.isArray(value)) return value.map(bind);
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, bind(item)]));
      if (typeof value !== 'string') return value;
      return value.replace(/\$([\w:.-]+)/g, (_, key) => { if (!(key in values)) throw new AppError(`Thiếu biến fixture: ${key}`, 422); return String(values[key]); });
    };
    const body = JSON.stringify(bind(step.body || {}));
    const response = await fetch(url, { method: step.method, headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new AppError(`Fixture ${stage}: HTTP ${response.status}`, 422);
  }
}
async function triggerSchedule(schedule, user) {
  await assertProjectAccess(user, schedule.project, { manage: true });
  const query = { project: schedule.project, status: 'Approved' };
  if (schedule.scripts.length) query._id = { $in: schedule.scripts };
  else if (schedule.suite) query.testCase = { $in: await TestCase.find({ testSuite: schedule.suite }).distinct('_id') };
  if (schedule.cycle) { const { AgileIssue } = require('../models'); const caseIds = await AgileIssue.find({ project: schedule.project, cycle: schedule.cycle, approvalStatus: 'Approved', testCase: { $ne: null } }).distinct('testCase'); query.testCase = query.testCase ? { $in: query.testCase.$in.filter((id) => caseIds.some((c) => String(c) === String(id))) } : { $in: caseIds }; }
  return createBatch({ project: schedule.project, scripts: await AutomationScript.find(query).distinct('_id'), environment: schedule.environment, dataset: schedule.dataset, fixture: schedule.fixture, matrix: schedule.matrix, user, schedule: schedule._id });
}
function initializeAutomationSchedules() {
  const tasks = new Map();
  async function refresh() {
    const schedules = await Schedule.find({ active: true }); const active = new Set(schedules.map((x) => String(x._id)));
    for (const [id, entry] of tasks) if (!active.has(id)) { entry.task.stop(); tasks.delete(id); }
    for (const schedule of schedules) {
      const id = String(schedule._id); const signature = `${schedule.cron}:${schedule.timezone}:${schedule.updatedAt}`;
      if (tasks.get(id)?.signature === signature) continue;
      tasks.get(id)?.task.stop();
      const task = cron.schedule(schedule.cron, async () => {
        const locked = await Schedule.findOneAndUpdate({ _id: id, active: true, $or: [{ leaseUntil: { $lt: new Date() } }, { leaseUntil: null }] }, { leaseUntil: new Date(Date.now() + 60000), lastTriggeredAt: new Date() }, { new: true });
        if (!locked) return;
        try { const user = await require('../models').User.findById(locked.createdBy).populate('role'); await triggerSchedule(locked, user); }
        catch (error) { await Schedule.updateOne({ _id: id }, { lastError: error.message }); await Notification.create({ recipient: locked.createdBy, type: 'System', title: 'Lịch automation thất bại', message: error.message, link: '/studio/automation-operations' }).catch(() => null); }
      }, { timezone: schedule.timezone });
      tasks.set(id, { signature, task });
    }
  }
  refresh().catch(console.error); const timer = setInterval(() => refresh().catch(console.error), 30000); timer.unref();
}
function startHeartbeat(name) {
  const os = require('node:os'); const id = `${name}:${os.hostname()}:${process.pid}`;
  const beat = () => Health.findOneAndUpdate({ name: id }, { lastSeen: new Date(), hostname: os.hostname(), pid: process.pid }, { upsert: true }).catch(console.error);
  beat(); const timer = setInterval(beat, 15000); timer.unref(); return timer;
}
function startWorkerWatchdog() {
  const check = async () => {
    const cutoff = new Date(Date.now() - 60000);
    const stale = await Health.find({ lastSeen: { $lt: cutoff }, $or: [{ lastAlertAt: null }, { lastAlertAt: { $lt: new Date(Date.now() - 10 * 60000) } }] });
    if (!stale.length) return;
    const { User, Role } = require('../models');
    const adminRole = await Role.findOne({ name: 'System_Admin' }).select('_id');
    const admins = adminRole ? await User.find({ role: adminRole._id, status: 'active' }).select('_id') : [];
    await Promise.all(stale.flatMap((worker) => [
      Health.updateOne({ _id: worker._id }, { lastAlertAt: new Date() }),
      ...admins.map((admin) => Notification.create({ recipient: admin._id, type: 'System', title: 'Worker ETMS không phản hồi', message: `${worker.name} mất heartbeat hơn 60 giây.`, link: '/studio/automation-operations' })),
    ]));
  };
  check().catch(console.error); const timer = setInterval(() => check().catch(console.error), 30000); timer.unref(); return timer;
}
module.exports = { createBatch, checkResource, runtimeData, substitute, applyFixture, triggerSchedule, initializeAutomationSchedules, startHeartbeat, startWorkerWatchdog, encryptCredential };
