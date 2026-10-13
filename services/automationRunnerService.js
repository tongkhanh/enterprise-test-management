const fs = require('node:fs');
const fsp = require('node:fs').promises;
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const {
  AutomationResult, TestCase, TestPlan, TestRun, TestExecution,
  TestSuite, SharedTestData, Notification, TestEnvironment, ExecutionArtifact, SystemProfile,
} = require('../models');
const { AppError } = require('../utils/http');
const { validateTargetUrl, cleanUrlForLog, findBrowserExecutable } = require('./webAnalyzerService');

const ARTIFACT_ROOT = path.join(__dirname, '..', 'storage', 'automation');
const MAX_CONCURRENCY = Math.max(1, Number(process.env.AUTOMATION_MAX_CONCURRENCY || 2));
const queue = [];
const running = new Map();
let activeCount = 0;
let lastArtifactCleanup = 0;

class CancelledError extends Error {}

const safeFilename = (value) => String(value).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
const artifactUrl = (jobId, name) => `/api/v1/automation-results/${jobId}/artifacts/${encodeURIComponent(name)}`;
const artifactPath = (jobId, name) => {
  const folder = path.resolve(ARTIFACT_ROOT, safeFilename(jobId));
  const resolved = path.resolve(folder, path.basename(name));
  if (!resolved.startsWith(`${folder}${path.sep}`)) throw new AppError('Đường dẫn artifact không hợp lệ.', 400);
  return resolved;
};
const persistUnifiedArtifacts = async (result, artifacts) => {
  const typeMap = { screenshot: 'Screenshot', trace: 'Trace', dom: 'DOM' };
  const rows = [];
  for (const [key, artifact] of Object.entries(artifacts || {})) {
    const file = artifactPath(result._id, artifact.name); if (!fs.existsSync(file)) continue; const bytes = await fsp.readFile(file);
    rows.push({ project: result.project, automationResult: result._id, source: 'Playwright', artifactType: typeMap[key] || 'Other', name: artifact.name, mimeType: artifact.type, uri: file, size: bytes.length, checksum: crypto.createHash('sha256').update(bytes).digest('hex') });
  }
  if (rows.length) await ExecutionArtifact.insertMany(rows);
};

const cleanupExpiredArtifacts = async () => {
  if (Date.now() - lastArtifactCleanup < 60 * 60 * 1000) return;
  lastArtifactCleanup = Date.now();
  const ttlHours = Math.min(Math.max(Number(process.env.AUTOMATION_ARTIFACT_TTL_HOURS) || 72, 1), 720);
  const cutoff = Date.now() - ttlHours * 60 * 60 * 1000;
  await fsp.mkdir(ARTIFACT_ROOT, { recursive: true });
  const root = path.resolve(ARTIFACT_ROOT);
  const entries = await fsp.readdir(root, { withFileTypes: true });
  await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
    const folder = path.resolve(root, entry.name);
    if (!folder.startsWith(`${root}${path.sep}`) || running.has(entry.name)) return;
    const stat = await fsp.stat(folder);
    if (stat.mtimeMs < cutoff) await fsp.rm(folder, { recursive: true, force: true });
  }));
};

const redact = (value) => String(value ?? '')
  .replace(/(authorization|cookie|token|password|secret|api[-_]?key)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
  .slice(0, 4000);

const getPathValue = (data, key) => key.split('.').reduce((current, part) => current?.[part], data);
const resolveValue = (value, data) => String(value ?? '').replace(/\$([a-zA-Z_][\w.]*)/g, (_, key) => {
  const resolved = getPathValue(data, key);
  return resolved === undefined || resolved === null ? `$${key}` : String(resolved);
});

const locatorFromDefinition = (page, definition) => {
  if (!definition || typeof definition !== 'object') throw new AppError('Bước tự động thiếu locator.', 422);
  const strategy = definition.strategy;
  if (strategy === 'role') {
    if (!definition.role) throw new AppError('Role locator thiếu role.', 422);
    return page.getByRole(definition.role, definition.name ? { name: String(definition.name), exact: Boolean(definition.exact) } : {});
  }
  if (strategy === 'testId') return page.getByTestId(String(definition.value || definition.name || ''));
  if (strategy === 'text') return page.getByText(String(definition.value || definition.name || ''), { exact: Boolean(definition.exact) });
  if (strategy === 'css') {
    const selector = String(definition.value || '');
    if (!selector || selector.length > 500 || /javascript:|<script/i.test(selector)) throw new AppError('CSS selector không an toàn.', 422);
    return page.locator(selector);
  }
  throw new AppError(`Locator strategy “${strategy}” chưa được hỗ trợ.`, 422);
};

const executeStep = async ({ page, step, testData, targetUrl, trustedOrigin }) => {
  const action = step.automationAction || 'manual';
  const value = resolveValue(step.value || step.testData || '', testData);
  if (action === 'goto') {
    const destination = new URL(value || targetUrl, targetUrl).toString();
    if (!trustedOrigin || new URL(destination).origin !== trustedOrigin) await validateTargetUrl(destination);
    const response = await page.goto(destination, { waitUntil: 'domcontentloaded' });
    return `Đã mở ${cleanUrlForLog(page.url())} (${response?.status() || 'không có status'})`;
  }
  if (action === 'manual') throw new AppError('Bước này cần thao tác thủ công và không thể chạy tự động.', 422);
  if (action === 'assertUrl') {
    if (!page.url().includes(value)) throw new AppError(`URL hiện tại “${cleanUrlForLog(page.url())}” không chứa “${value}”.`, 422);
    return `URL khớp “${value}”`;
  }
  if (action === 'waitForResponse') {
    const response = await page.waitForResponse((item) => item.url().includes(value));
    if (response.status() >= 400) throw new AppError(`Response ${value} trả HTTP ${response.status()}.`, 422);
    return `Response ${response.status()} từ ${cleanUrlForLog(response.url())}`;
  }

  const locator = locatorFromDefinition(page, step.locator);
  if (action === 'click') { await locator.click(); return 'Đã click phần tử'; }
  if (action === 'fill') { await locator.fill(value); return 'Đã nhập dữ liệu'; }
  if (action === 'select') { await locator.selectOption(value); return `Đã chọn “${value}”`; }
  if (action === 'check') { await locator.check(); return 'Đã chọn checkbox/radio'; }
  if (action === 'uncheck') { await locator.uncheck(); return 'Đã bỏ chọn checkbox'; }
  if (action === 'press') { await locator.press(value); return `Đã nhấn phím ${value}`; }
  if (action === 'assertVisible') { await locator.waitFor({ state: 'visible' }); return 'Phần tử đang hiển thị'; }
  if (action === 'assertText') {
    await locator.waitFor({ state: 'visible' });
    const actual = String(await locator.innerText()).replace(/\s+/g, ' ').trim();
    if (!actual.includes(value)) throw new AppError(`Nội dung thực tế “${actual.slice(0, 500)}” không chứa “${value}”.`, 422);
    return `Nội dung chứa “${value}”`;
  }
  throw new AppError(`Automation action “${action}” chưa được hỗ trợ.`, 422);
};

const collectTestData = async (testCase, override = {}) => {
  const shared = testCase.sharedTestData?.length
    ? await SharedTestData.find({ _id: { $in: testCase.sharedTestData }, isActive: true }).lean()
    : [];
  return Object.assign({}, ...shared.map((item) => item.data || {}), testCase.generatedTestData || {}, override || {});
};

// Hooks are intentionally limited to the target application's own origin.
// They allow an application to seed and remove tagged E2E data without giving
// the runner a general-purpose shell or arbitrary network capability.
const runE2eHook = async ({ hook, targetUrl, testData, label }) => {
  if (!hook) return null;
  const destination = new URL(hook, targetUrl);
  if (destination.origin !== new URL(targetUrl).origin) throw new AppError(`${label} endpoint phải cùng origin với Target URL.`, 422);
  const response = await fetch(destination, { method: 'POST', headers: { 'content-type': 'application/json', 'x-etms-e2e': 'true' }, body: JSON.stringify({ testData }) });
  if (!response.ok) throw new AppError(`${label} endpoint trả HTTP ${response.status}.`, 422);
  return `${label} hoàn tất (${response.status})`;
};

const updateExecutionAndRun = async ({ result, status, stepResults, evidence, durationSeconds, errorMessage }) => {
  const executionResult = status === 'Passed' ? 'Passed' : status === 'Cancelled' ? 'Skipped' : 'Failed';
  await TestExecution.findByIdAndUpdate(result.testExecution, {
    result: executionResult,
    executedAt: new Date(),
    duration: Math.max(0, durationSeconds / 60),
    actualResult: status === 'Passed' ? 'Automation hoàn tất thành công.' : errorMessage || `Automation ${status}`,
    notes: `Playwright job ${result._id}`,
    evidence,
    stepResults: stepResults.map((step) => ({
      stepNumber: step.stepNumber,
      status: step.status === 'Passed' ? 'Passed' : step.status === 'Skipped' ? 'Skipped' : 'Failed',
      actualResult: step.actualResult || '', note: step.error || '',
    })),
  });
  const groups = await TestExecution.aggregate([
    { $match: { testRun: result.testRun } },
    { $group: { _id: '$result', count: { $sum: 1 } } },
  ]);
  const counts = Object.fromEntries(groups.map((group) => [group._id, group.count]));
  const totalCases = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const pending = counts.NotRun || 0;
  const completed = totalCases > 0 && pending === 0;
  const run = await TestRun.findByIdAndUpdate(result.testRun, {
    status: completed ? 'Completed' : 'InProgress',
    startedAt: result.startedAt || new Date(), completedAt: completed ? new Date() : null,
    totalCases, passedCount: counts.Passed || 0, failedCount: counts.Failed || 0,
    blockedCount: counts.Blocked || 0, skippedCount: counts.Skipped || 0,
  }, { new: true });
  if (completed && run?.testPlan) {
    await TestPlan.findByIdAndUpdate(run.testPlan, { status: 'Completed', endDate: new Date() });
  }
};

const executeJob = async (jobId) => {
  let browser; let context; let page; let traceStarted = false; let e2eCleanup = null;
  const controller = { cancelled: false, browser: null };
  running.set(String(jobId), controller);
  const started = Date.now();
  let stepResults = []; const consoleMessages = []; const pageErrors = []; const failedRequests = []; const httpErrors = [];
  const push = (array, item) => { if (array.length < 100) array.push(item); };
  try {
    let result = await AutomationResult.findById(jobId).select('+runtimeConfig');
    if (!result || result.status === 'Cancelled') return;
    const testCase = await TestCase.findById(result.testCase).lean();
    if (!testCase) throw new AppError('Test Case của job không còn tồn tại.', 404);
    if (!['Approved', 'Active'].includes(testCase.status)) throw new AppError('Chỉ Test Case đã được QA Manager phê duyệt mới được chạy.', 409);
    const targetUrl = result.targetUrl || testCase.targetUrl;
    if (!targetUrl) throw new AppError('Test Case chưa có targetUrl.', 422);
    const trustedOrigin = result.testEnvironment ? new URL(targetUrl).origin : null;
    const profile = testCase.e2e?.systemProfile ? await SystemProfile.findById(testCase.e2e.systemProfile).lean() : null;
    const testData = Object.assign({}, profile?.testData || {}, await collectTestData(testCase, result.runtimeConfig?.testData));
    e2eCleanup = profile?.hooks?.cleanupUrl ? { hook: profile.hooks.cleanupUrl, targetUrl, testData, label: 'Cleanup E2E' } : null;
    if (profile?.hooks?.seedUrl) await runE2eHook({ hook: profile.hooks.seedUrl, targetUrl, testData, label: 'Seed E2E' });
    result.status = 'Running'; result.startedAt = new Date(); result.progress = 1; result.totalSteps = testCase.testSteps.length;
    await result.save({ validateBeforeSave: false });

    const executablePath = findBrowserExecutable();
    browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    controller.browser = browser;
    context = await browser.newContext({
      viewport: result.viewport || { width: 1440, height: 900 },
      ignoreHTTPSErrors: String(process.env.WEB_ANALYZER_IGNORE_HTTPS_ERRORS).toLowerCase() === 'true',
      locale: 'vi-VN',
    });
    context.setDefaultTimeout(Number(process.env.AUTOMATION_ACTION_TIMEOUT_MS || 15000));
    context.setDefaultNavigationTimeout(Number(process.env.AUTOMATION_NAVIGATION_TIMEOUT_MS || 30000));
    const validationCache = new Map();
    await context.route('**/*', async (route) => {
      const requestUrl = route.request().url();
      if (/^(data|blob|about):/i.test(requestUrl)) return route.continue();
      try {
        const parsed = new URL(requestUrl); const key = `${parsed.protocol}//${parsed.host}`;
        if (!validationCache.has(key)) validationCache.set(key, trustedOrigin && parsed.origin === trustedOrigin ? Promise.resolve() : validateTargetUrl(requestUrl));
        await validationCache.get(key); return route.continue();
      } catch (error) { push(failedRequests, { url: cleanUrlForLog(requestUrl), reason: `Blocked: ${error.message}` }); return route.abort('blockedbyclient'); }
    });
    await cleanupExpiredArtifacts();
    const jobFolder = path.join(ARTIFACT_ROOT, safeFilename(jobId));
    await fsp.mkdir(jobFolder, { recursive: true });
    const traceName = 'trace.zip';
    await context.tracing.start({ screenshots: true, snapshots: true, sources: false }); traceStarted = true;
    page = await context.newPage();
    page.on('console', (message) => { if (['error', 'warning'].includes(message.type())) push(consoleMessages, { type: message.type(), text: redact(message.text()), url: cleanUrlForLog(message.location()?.url || '') }); });
    page.on('pageerror', (error) => push(pageErrors, { name: error.name, message: redact(error.message) }));
    page.on('requestfailed', (request) => push(failedRequests, { url: cleanUrlForLog(request.url()), method: request.method(), reason: request.failure()?.errorText || 'Request failed' }));
    page.on('response', (response) => { if (response.status() >= 400) push(httpErrors, { url: cleanUrlForLog(response.url()), status: response.status(), method: response.request().method() }); });

    if (!result.testEnvironment) await validateTargetUrl(targetUrl);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
    for (let index = 0; index < testCase.testSteps.length; index += 1) {
      if (controller.cancelled) throw new CancelledError('Job đã được hủy.');
      const step = testCase.testSteps[index]; const stepStarted = Date.now();
      try {
        const actualResult = await executeStep({ page, step, testData, targetUrl, trustedOrigin });
        stepResults.push({ stepNumber: index + 1, action: step.action, automationAction: step.automationAction, status: 'Passed', expectedResult: step.expectedResult, actualResult, durationMs: Date.now() - stepStarted });
      } catch (error) {
        stepResults.push({ stepNumber: index + 1, action: step.action, automationAction: step.automationAction, status: 'Failed', expectedResult: step.expectedResult, actualResult: 'Bước kiểm thử không đạt.', error: redact(error.message), durationMs: Date.now() - stepStarted });
        throw error;
      } finally {
        await AutomationResult.findByIdAndUpdate(jobId, { currentStep: index + 1, progress: Math.max(1, Math.round(((index + 1) / testCase.testSteps.length) * 95)), stepResults });
      }
    }

    const screenshotName = 'passed.jpg';
    await page.screenshot({ path: artifactPath(jobId, screenshotName), type: 'jpeg', quality: 75, fullPage: false, animations: 'disabled' });
    await context.tracing.stop({ path: artifactPath(jobId, traceName) }); traceStarted = false;
    const duration = (Date.now() - started) / 1000;
    const artifacts = {
      screenshot: { name: screenshotName, url: artifactUrl(jobId, screenshotName), type: 'image/jpeg' },
      trace: { name: traceName, url: artifactUrl(jobId, traceName), type: 'application/zip' },
    };
    result = await AutomationResult.findByIdAndUpdate(jobId, {
      status: 'Passed', progress: 100, duration, completedAt: new Date(), passed: 1, failed: 0, totalTests: 1,
      stepResults, diagnostics: { consoleMessages, pageErrors, failedRequests, httpErrors, finalUrl: cleanUrlForLog(page.url()) }, artifacts,
    }, { new: true });
    await persistUnifiedArtifacts(result, artifacts);
    await updateExecutionAndRun({ result, status: 'Passed', stepResults, evidence: [artifacts.screenshot.url], durationSeconds: duration });
  } catch (error) {
    const result = await AutomationResult.findById(jobId);
    if (!result) return;
    const cancelled = error instanceof CancelledError || controller.cancelled;
    // Khi browser đã mở được, lỗi locator/assertion/navigation là lỗi kiểm thử (Failed).
    // Chỉ lỗi khởi tạo browser hoặc hạ tầng runner mới được ghi là Error.
    const status = cancelled ? 'Cancelled' : ((error instanceof AppError && error.statusCode === 422) || page ? 'Failed' : 'Error');
    const jobFolder = path.join(ARTIFACT_ROOT, safeFilename(jobId)); await fsp.mkdir(jobFolder, { recursive: true });
    const artifacts = {};
    if (page && !page.isClosed()) {
      const screenshotName = 'failure.jpg';
      await page.screenshot({ path: artifactPath(jobId, screenshotName), type: 'jpeg', quality: 78, fullPage: false, animations: 'disabled' }).catch(() => null);
      if (fs.existsSync(artifactPath(jobId, screenshotName))) artifacts.screenshot = { name: screenshotName, url: artifactUrl(jobId, screenshotName), type: 'image/jpeg' };
      const domName = 'failure.html'; await fsp.writeFile(artifactPath(jobId, domName), (await page.content().catch(() => '')).slice(0, 2_000_000), 'utf8');
      artifacts.dom = { name: domName, url: artifactUrl(jobId, domName), type: 'text/html' };
    }
    if (context && traceStarted) {
      const traceName = 'trace.zip';
      await context.tracing.stop({ path: artifactPath(jobId, traceName) }).catch(() => null); traceStarted = false;
      if (fs.existsSync(artifactPath(jobId, traceName))) artifacts.trace = { name: traceName, url: artifactUrl(jobId, traceName), type: 'application/zip' };
    }
    const duration = (Date.now() - started) / 1000;
    const domSnippet = page && !page.isClosed() ? redact(await page.locator('body').innerText().catch(() => '')).slice(0, 12000) : null;
    const updated = await AutomationResult.findByIdAndUpdate(jobId, {
      status, progress: 100, duration, completedAt: new Date(), passed: 0, failed: cancelled ? 0 : 1, skipped: cancelled ? 1 : 0, totalTests: 1,
      stepResults, errorLogs: redact(error.message), diagnostics: { consoleMessages, pageErrors, failedRequests, httpErrors, finalUrl: page && !page.isClosed() ? cleanUrlForLog(page.url()) : null, domSnippet }, artifacts,
    }, { new: true });
    await persistUnifiedArtifacts(updated, artifacts);
    await updateExecutionAndRun({ result: updated, status, stepResults, evidence: artifacts.screenshot ? [artifacts.screenshot.url] : [], durationSeconds: duration, errorMessage: redact(error.message) });
  } finally {
    if (e2eCleanup) await runE2eHook(e2eCleanup).catch(() => null);
    if (context && traceStarted) await context.tracing.stop().catch(() => null);
    if (browser) await browser.close().catch(() => null);
    running.delete(String(jobId)); activeCount -= 1; drainQueue();
  }
};

const drainQueue = () => {
  while (activeCount < MAX_CONCURRENCY && queue.length) {
    const jobId = queue.shift(); activeCount += 1;
    setImmediate(() => executeJob(jobId));
  }
};

const enqueueAutomationJob = (jobId) => { queue.push(String(jobId)); drainQueue(); };

const cancelAutomationJob = async (jobId) => {
  const queuedIndex = queue.indexOf(String(jobId));
  if (queuedIndex >= 0) {
    queue.splice(queuedIndex, 1);
    const result = await AutomationResult.findByIdAndUpdate(jobId, {
      status: 'Cancelled', progress: 100, completedAt: new Date(), skipped: 1, totalTests: 1,
    }, { new: true });
    if (result) await updateExecutionAndRun({
      result, status: 'Cancelled', stepResults: [], evidence: [], durationSeconds: 0,
      errorMessage: 'Job đã bị hủy trước khi bắt đầu.',
    });
    return result;
  }
  const active = running.get(String(jobId));
  if (active) { active.cancelled = true; if (active.browser) await active.browser.close().catch(() => null); }
  return AutomationResult.findById(jobId);
};

const createAutomationJob = async ({ testCaseId, userId, testRunId, testPlanId, browserName = 'chromium', viewport, testData, environment = 'Staging', testEnvironmentId }) => {
  const testCase = await TestCase.findById(testCaseId);
  if (!testCase) throw new AppError('Test Case không tồn tại.', 404);
  if (!['Approved', 'Active'].includes(testCase.status)) throw new AppError('Test Case phải được QA Manager phê duyệt trước khi chạy.', 409);
  if (testCase.type !== 'Automated') throw new AppError('Test Case này chưa được đánh dấu Automated.', 409);
  const suite = await TestSuite.findById(testCase.testSuite);
  if (!suite) throw new AppError('Test Suite không tồn tại.', 404);
  let testEnvironment = null;
  if (testEnvironmentId) {
    testEnvironment = await TestEnvironment.findById(testEnvironmentId);
    if (!testEnvironment || String(testEnvironment.project) !== String(suite.project)) throw new AppError('Test Environment không thuộc Project này.', 409);
    if (testEnvironment.status !== 'Ready' || !testEnvironment.targetUrl) throw new AppError('Test Environment chưa ở trạng thái Ready.', 409);
  }
  let plan = testPlanId ? await TestPlan.findById(testPlanId) : null;
  if (testPlanId && !plan) throw new AppError('Test Plan được chọn không tồn tại.', 404);
  if (plan && String(plan.project) !== String(suite.project)) throw new AppError('Test Plan và Test Case phải thuộc cùng Project.', 409);
  if (!plan) plan = await TestPlan.create({ name: `AI Automation · ${testCase.title}`, description: 'Tạo tự động từ AI Test Studio', scope: testCase.title, status: 'Active', environment, project: suite.project, testCases: [testCase._id], assignee: userId, createdBy: userId, startDate: new Date() });
  else { plan.testCases.addToSet(testCase._id); plan.status = 'Active'; await plan.save(); }
  let run = testRunId ? await TestRun.findById(testRunId) : null;
  if (testRunId && !run) throw new AppError('Test Run được chọn không tồn tại.', 404);
  if (run && String(run.testPlan) !== String(plan._id)) throw new AppError('Test Run không thuộc Test Plan được chọn.', 409);
  if (!run) run = await TestRun.create({ name: `Run · ${testCase.title} · ${new Date().toLocaleString('vi-VN')}`, description: 'Playwright execution', environment, status: 'NotStarted', totalCases: 1, testPlan: plan._id, assignee: userId, createdBy: userId });
  let execution = await TestExecution.findOne({ testRun: run._id, testCase: testCase._id });
  if (!execution) execution = await TestExecution.create({ testRun: run._id, testCase: testCase._id, executedBy: userId });
  const width = Math.min(Math.max(Number(viewport?.width) || 1440, 320), 2560);
  const height = Math.min(Math.max(Number(viewport?.height) || 900, 320), 1600);
  const result = await AutomationResult.create({
    suiteName: testCase.title, framework: 'Playwright', status: 'Queued', triggeredBy: 'Manual',
    totalTests: 1, progress: 0, totalSteps: testCase.testSteps.length, targetUrl: testEnvironment?.targetUrl || testCase.targetUrl,
    testEnvironment: testEnvironment?._id || null,
    browserName, viewport: { width, height }, runtimeConfig: { testData: testData || {} },
    project: suite.project, testPlan: plan._id, testRun: run._id, testExecution: execution._id,
    testCase: testCase._id, userStory: testCase.userStory, requestedBy: userId,
  });
  enqueueAutomationJob(result._id);
  return result;
};

const recoverInterruptedAutomationJobs = async () => AutomationResult.updateMany(
  { status: { $in: ['Queued', 'Running'] } },
  { status: 'Error', progress: 100, completedAt: new Date(), errorLogs: 'Server đã khởi động lại trước khi job hoàn tất.' }
);

const getAutomationArtifact = async (jobId, name) => {
  const result = await AutomationResult.findById(jobId).lean();
  if (!result) throw new AppError('Automation job không tồn tại.', 404);
  const artifact = Object.values(result.artifacts || {}).find((item) => item?.name === name);
  if (!artifact) throw new AppError('Artifact không tồn tại.', 404);
  const filePath = artifactPath(jobId, name);
  if (!fs.existsSync(filePath)) throw new AppError('File artifact đã hết hạn hoặc bị xóa.', 404);
  return { result, artifact, filePath };
};

module.exports = {
  createAutomationJob, enqueueAutomationJob, cancelAutomationJob,
  recoverInterruptedAutomationJobs, getAutomationArtifact,
  _test: { resolveValue, locatorFromDefinition, executeStep },
};
