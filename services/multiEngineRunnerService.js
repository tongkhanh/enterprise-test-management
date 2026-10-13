const path = require('node:path');
const fs = require('node:fs/promises');
const Docker = require('dockerode');
const { AutomationRun, AutomationScript, AutomationProfile, AutomationResult, TestEnvironment } = require('../models');
const { AppError } = require('../utils/http');
const { normalizeEvidence } = require('./evidenceNormalizerService');
const resources = require('./automationResourcesService');
const docker = new Docker(process.env.DOCKER_HOST ? { host: process.env.DOCKER_HOST } : undefined);
const root = path.resolve(path.join(__dirname, '..', 'storage', 'multi-engine'));
const defaults = {
  Playwright: { image: 'mcr.microsoft.com/playwright:v1.55.0-noble', command: ['sh', '-lc', 'cd /workspace && npm init -y >/dev/null 2>&1 && npm i @playwright/test@1.55.0 >/dev/null 2>&1 && npx playwright test "$SCRIPT_FILE" --reporter=line'] },
  Cypress: { image: 'cypress/included:13.15.0', command: ['sh', '-lc', 'cd /workspace && cypress run --spec "$SCRIPT_FILE" --browser chrome'] },
  Selenium: { image: 'node:22-bookworm', command: ['sh', '-lc', 'cd /workspace && npm init -y >/dev/null 2>&1 && npm i selenium-webdriver >/dev/null 2>&1 && node "$SCRIPT_FILE"'] },
  WebdriverIO: { image: 'node:22-bookworm', command: ['sh', '-lc', 'cd /workspace && npm init -y >/dev/null 2>&1 && npm i webdriverio >/dev/null 2>&1 && node "$SCRIPT_FILE"'] },
  RobotFramework: { image: 'python:3.12-slim', command: ['sh', '-lc', 'pip install --disable-pip-version-check robotframework robotframework-seleniumlibrary >/dev/null 2>&1 && robot --outputdir /workspace/results "$SCRIPT_FILE"'] },
};
const adapters = Object.fromEntries(Object.keys(defaults).map((engine) => [engine, {
  prepare: async ({ directory, script }) => fs.writeFile(path.join(directory, script.filename), script.code, 'utf8'),
  validate: ({ profile }) => { if (!profile.image || !profile.command?.length) throw new AppError(`Profile ${engine} thiếu image/command.`, 422); },
  collectArtifacts: async () => [], cleanup: async () => {},
}]));

async function ensureDefaultProfile({ project, engine, userId }) {
  let profile = await AutomationProfile.findOne({ project, engine, isDefault: true });
  if (!profile) profile = await AutomationProfile.create({ project, engine, name: `${engine} default`, ...defaults[engine], isDefault: true, createdBy: userId });
  return profile;
}
async function createAutomationRun({ scriptId, environmentId, profileId, userId, dataset, fixture, matrix, dataRow = 0, groupId, schedule, triggeredBy = 'Manual' }) {
  const script = await AutomationScript.findById(scriptId); if (!script) throw new AppError('Automation Script không tồn tại.', 404);
  if (script.status !== 'Approved') throw new AppError('Automation Script phải được QA Manager duyệt trước khi chạy.', 409);
  const environment = await TestEnvironment.findById(environmentId); if (!environment || environment.status !== 'Ready') throw new AppError('Test Environment phải ở trạng thái Ready.', 409);
  if (String(environment.project) !== String(script.project)) throw new AppError('Script và Environment phải cùng Project.', 409);
  const profile = profileId ? await AutomationProfile.findById(profileId) : await ensureDefaultProfile({ project: script.project, engine: script.engine, userId });
  if (!profile || String(profile.project) !== String(script.project) || profile.engine !== script.engine) throw new AppError('Profile không thuộc Project/engine.', 409);
  const tc = await require('../models').TestCase.findById(script.testCase);
  if (tc?.quarantined) throw new AppError('Test Case đang bị quarantine.', 409);
  const run = await AutomationRun.create({ project: script.project, testCase: script.testCase, script: script._id, profile: profile._id, environment: environment._id, commitSha: environment.repository?.commitSha, targetUrl: environment.targetUrl, engine: script.engine, requestedBy: userId, dataset, fixture, matrix, dataRow, groupId, schedule, triggeredBy });
  const job = await require('./queueService').enqueueAutomationRun(run._id);
  if (job) { run.jobId = job.id; await run.save(); } else setImmediate(() => executeWithRetries(run._id).catch(console.error));
  return run;
}
async function executeAutomationRun(runId, progress = async () => {}) {
  const run = await AutomationRun.findById(runId); if (!run) throw new Error('AutomationRun không tồn tại.');
  const [script, profile, environment] = await Promise.all([AutomationScript.findById(run.script), AutomationProfile.findById(run.profile), TestEnvironment.findById(run.environment)]);
  const adapter = adapters[run.engine]; if (!adapter || !script || !profile || !environment) throw new Error('Automation run configuration không đầy đủ.');
  adapter.validate({ profile }); const values = await resources.runtimeData(run);
  const directory = path.join(root, String(run._id), `attempt-${run.attempt + 1}`); await fs.mkdir(directory, { recursive: true }); await adapter.prepare({ directory, script: { filename: script.filename, code: resources.substitute(script.code, values, run.engine) }, environment, profile });
  if (run.engine === 'Playwright') {
    const matrix = run.matrix || {}; const browserName = ['chrome', 'edge'].includes(matrix.browser) ? 'chromium' : matrix.browser || 'chromium';
    const channel = matrix.browser === 'chrome' ? 'chrome' : matrix.browser === 'edge' ? 'msedge' : undefined;
    await fs.writeFile(path.join(directory, 'playwright.config.cjs'), `const {devices}=require('@playwright/test'); module.exports=${JSON.stringify({ timeout: Math.min(profile.timeoutMs, 300000), retries: 0, use: { browserName, channel, viewport: matrix.device ? require('playwright').devices[matrix.device]?.viewport : { width: matrix.width || 1440, height: matrix.height || 900 }, screenshot: 'only-on-failure', video: 'retain-on-failure', trace: 'retain-on-failure' } }).replace('"use":{', `"use":{...(devices[${JSON.stringify(matrix.device || '')}]||{}),`)};`);
  }
  if (run.engine === 'Cypress') await fs.writeFile(path.join(directory, 'cypress.config.js'), "module.exports={video:true,screenshotOnRunFailure:true,e2e:{supportFile:false,specPattern:'**/*.cy.js'}};");
  const result = await AutomationResult.create({ suiteName: script.filename, framework: run.engine === 'RobotFramework' ? 'Robot' : run.engine, status: 'Running', triggeredBy: run.triggeredBy, project: run.project, testCase: run.testCase, targetUrl: environment.targetUrl, testEnvironment: environment._id, requestedBy: run.requestedBy, startedAt: new Date() });
  run.result = result._id; run.status = 'Running'; run.startedAt = new Date(); run.attempt += 1; await run.save(); await progress(20);
  let container; let sidecar; let network; let seleniumHost = 'selenium'; let timeout;
  try {
    await resources.applyFixture(run.fixture, 'setup', environment.targetUrl, values);
    await docker.pull(profile.image).then((stream) => new Promise((resolve, reject) => docker.modem.followProgress(stream, (error) => error ? reject(error) : resolve())));
    if (['Selenium', 'WebdriverIO', 'RobotFramework'].includes(run.engine)) { await docker.pull('selenium/standalone-chrome:latest').then((stream) => new Promise((resolve, reject) => docker.modem.followProgress(stream, (error) => error ? reject(error) : resolve()))); network = await docker.createNetwork({ Name: `etms-run-${run._id}` }); seleniumHost = `selenium-${run._id}`; sidecar = await docker.createContainer({ Image: 'selenium/standalone-chrome:latest', name: seleniumHost, HostConfig: { AutoRemove: true, ShmSize: 2 * 1024 * 1024 * 1024, NetworkMode: network.id } }); await sidecar.start(); await new Promise((resolve) => setTimeout(resolve, 5000)); }
    // Docker-in-Docker socket mounts must use the shared named volume, not an API-container path on the host.
    const volume = process.env.RUNNER_STORAGE_VOLUME;
    const workingDir = '/workspace';
    const command = profile.command.map((part) => part.replace(/cd \/workspace\b/g, 'cd "$WORKSPACE_DIR"').replace(/--outputdir \/workspace\/results/g, '--outputdir "$WORKSPACE_DIR/results"'));
    container = await docker.createContainer({ Image: profile.image, Cmd: command, Env: [`TARGET_URL=${environment.targetUrl}`, `CYPRESS_TARGET_URL=${environment.targetUrl}`, `SCRIPT_FILE=${script.filename}`, `WORKSPACE_DIR=${workingDir}`, ...(['Selenium', 'RobotFramework'].includes(run.engine) ? [`SELENIUM_REMOTE_URL=http://${seleniumHost}:4444/wd/hub`] : []), ...(run.engine === 'WebdriverIO' ? [`SELENIUM_HOST=${seleniumHost}`] : [])], WorkingDir: workingDir, HostConfig: { AutoRemove: false, ...(volume ? { Mounts: [{ Type: 'volume', Source: volume, Target: '/workspace', VolumeOptions: { Subpath: `multi-engine/${run._id}/attempt-${run.attempt}` } }] } : { Binds: [`${directory}:/workspace`] }), PidsLimit: 256, SecurityOpt: ['no-new-privileges'], Memory: profile.resourceLimits.memoryMb * 1024 * 1024, NanoCpus: profile.resourceLimits.cpus * 1e9, ...(network ? { NetworkMode: network.id } : {}) } });
    await container.start(); await progress(45);
    const wait = await Promise.race([container.wait(), new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Automation timeout')), Math.min(profile.timeoutMs || 300000, 1200000)); })]); clearTimeout(timeout); run.status = 'Collecting'; await run.save();
    const rawLogs = await container.logs({ stdout: true, stderr: true });
    let logText = rawLogs.toString('utf8'); for (const value of Object.values(values)) if (String(value).length >= 4) logText = logText.split(String(value)).join('[REDACTED]');
    const logs = Buffer.from(logText); const logPath = path.join(directory, 'runner.log'); await fs.writeFile(logPath, logs);
    const evidence = await normalizeEvidence({ directory, project: run.project, automationResult: result._id, source: run.engine, environment: environment._id });
    const passed = wait.StatusCode === 0; run.status = passed ? 'Passed' : 'Failed'; run.completedAt = new Date();
    result.status = passed ? 'Passed' : 'Failed'; result.completedAt = new Date(); result.totalTests = 1; result.passed = passed ? 1 : 0; result.failed = passed ? 0 : 1; result.errorLogs = passed ? null : logs.toString('utf8').slice(-20000); result.artifacts = evidence.normalized.byType;
    await Promise.all([run.save(), result.save()]);
    const testCase = await require('../models').TestCase.findById(run.testCase);
    if (!passed && run.attempt <= (testCase?.retryLimit || 0)) { run.status = 'Queued'; await run.save(); return { retry: true, runId: run._id }; }
    if (!passed && run.schedule) await require('../models').Notification.create({ recipient: run.requestedBy, type: 'System', title: 'Scheduled test thất bại', message: `${script.filename}: ${run.status}`, link: '/studio/automation-operations' }).catch(() => null);
    if (!passed && environment.autoAnalyze !== false) await require('./rootCauseService').analyzeRootCause({ resultId: result._id, user: { _id: run.requestedBy } }).catch((error) => console.warn('RCA tự động thất bại:', error.message));
    await progress(100); return { runId: run._id, resultId: result._id, status: run.status };
  } catch (error) { run.status = 'Error'; run.error = error.message; run.completedAt = new Date(); result.status = 'Error'; result.errorLogs = error.message; result.completedAt = new Date(); await Promise.all([run.save(), result.save()]); throw error; }
  finally { clearTimeout(timeout); await resources.applyFixture(run.fixture, 'teardown', environment.targetUrl, values).catch((error) => console.warn('Fixture teardown:', error.message)); if (container) await container.remove({ force: true }).catch(() => null); if (sidecar) await sidecar.remove({ force: true }).catch(() => null); if (network) await network.remove().catch(() => null); await fs.unlink(path.join(directory, script.filename)).catch(() => null); await adapter.cleanup({ directory }).catch(() => null); }
}
async function executeWithRetries(id, progress) {
  try {
    const run = await AutomationRun.findById(id); if (!run) throw new Error('Run không tồn tại.');
    const user = await require('../models').User.findById(run.requestedBy).populate('role');
    await require('./projectAccessService').assertProjectAccess(user, run.project, { permission: 'execution:execute' });
    let result; do { result = await executeAutomationRun(id, progress); } while (result?.retry); return result;
  } catch (error) {
    await AutomationRun.updateOne({ _id: id }, { status: 'Error', error: error.message, completedAt: new Date() });
    throw error;
  }
}
module.exports = { adapters, defaults, ensureDefaultProfile, createAutomationRun, executeAutomationRun, executeWithRetries };
