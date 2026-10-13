const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const Docker = require('dockerode');
const yaml = require('js-yaml');
const { TestEnvironment, EnvironmentBuild, EnvironmentSecret, ExecutionArtifact, IntegrationConnection } = require('../models');
const { decryptCredential } = require('./integrationCredentialService');
const { AppError } = require('../utils/http');
const run = promisify(execFile);
const docker = new Docker(process.env.DOCKER_HOST ? { host: process.env.DOCKER_HOST } : undefined);
const workRoot = path.resolve(process.env.ENVIRONMENT_WORK_ROOT || path.join(__dirname, '..', 'storage', 'environment-workspaces'));
const artifactRoot = path.resolve(path.join(__dirname, '..', 'storage', 'environment-artifacts'));
const command = (file, args, options = {}) => run(file, args, { timeout: options.timeout || 120000, maxBuffer: 20 * 1024 * 1024, ...options });
const safeLog = (value) => String(value || '').replace(/(Bearer|token|password|secret)\s+[^\s]+/gi, '$1 ***').slice(-450000);
const append = async (build, text) => { build.logs = `${build.logs || ''}${safeLog(text)}\n`.slice(-450000); await build.save({ validateBeforeSave: false }); };

async function dockerStatus() {
  try { const info = await docker.info(); return { available: true, version: (await docker.version()).Version, containers: info.Containers, images: info.Images }; }
  catch { return { available: false, error: 'Docker Engine chưa sẵn sàng. Hãy cài/mở Docker Desktop rồi thử lại.' }; }
}
async function githubRequest(integrationId, endpoint) {
  const integration = await IntegrationConnection.findById(integrationId).select('+credentialCiphertext');
  if (!integration || integration.provider !== 'GitHub') throw new AppError('GitHub integration không tồn tại.', 404);
  const token = decryptCredential(integration.credentialCiphertext);
  const response = await fetch(`https://api.github.com${endpoint}`, { headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'ETMS-Automation-Lab' } });
  if (!response.ok) throw new AppError(`GitHub API ${response.status}: ${(await response.text()).slice(0, 300)}`, 502);
  return response.json();
}
async function detectRuntime(dir, preferred = {}) {
  const exists = (name) => fs.access(path.join(dir, name)).then(() => true).catch(() => false);
  const selected = preferred.dockerfile || '';
  if (selected && /(^|\/)(docker-)?compose\.ya?ml$/i.test(selected) && await exists(selected)) { const parsed = yaml.load(await fs.readFile(path.join(dir, selected), 'utf8')) || {}; const service = Object.keys(parsed.services || {})[0]; if (!service) throw new Error('Compose file không có service.'); return { mode: 'compose', composeFile: selected, service }; }
  const candidates = ['compose.yaml', 'compose.yml', 'docker-compose.yml', 'docker-compose.yaml'];
  const composeFile = (await Promise.all(candidates.map(async (name) => (await exists(name) ? name : null)))).find(Boolean);
  if (composeFile) { const parsed = yaml.load(await fs.readFile(path.join(dir, composeFile), 'utf8')) || {}; const service = Object.keys(parsed.services || {})[0]; if (!service) throw new Error('Compose file không có service.'); return { mode: 'compose', composeFile, service }; }
  const dockerfile = preferred.dockerfile || 'Dockerfile';
  if (await exists(dockerfile)) return { mode: 'dockerfile', dockerfile, context: preferred.context || '.' };
  throw new Error('Không tìm thấy Dockerfile hoặc Docker Compose trong repository.');
}
async function healthCheck(url, build, timeoutMs = 90000) {
  const started = Date.now(); let lastError = '';
  while (Date.now() - started < timeoutMs) {
    try { const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(5000) }); if (response.status < 500) return { ok: true, status: response.status }; lastError = `HTTP ${response.status}`; } catch (error) { lastError = error.message; }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  await append(build, `Health check failed: ${lastError}`); return { ok: false, error: lastError };
}
async function createEnvironmentBuild({ environment, source = 'Manual', ref, commitSha, pullRequestNumber, requestedBy }) {
  // Mongo ObjectId values are objects too. Only reuse `environment` when it
  // is an already loaded Environment document; otherwise resolve the ID so
  // the Build always receives its required project reference.
  const env = environment?.project ? environment : await TestEnvironment.findById(environment); if (!env) throw new AppError('Environment không tồn tại.', 404);
  // Static URL environments have no Git repository. Provisioning them only
  // performs a health check, so repository metadata must remain optional.
  const repository = env.repository || {};
  const build = await EnvironmentBuild.create({ environment: env._id, project: env.project, source, ref: ref || repository.ref || '', commitSha: commitSha || repository.commitSha || '', pullRequestNumber: pullRequestNumber || (source === 'Manual' ? repository.pullRequestNumber : null) || null, requestedBy });
  const job = await require('./queueService').enqueueEnvironmentBuild(build._id);
  if (job) { build.jobId = job.id; await build.save(); } else setImmediate(() => provisionBuild(build._id).catch(console.error));
  return build;
}
async function provisionBuild(buildId, progress = async () => {}) {
  const build = await EnvironmentBuild.findById(buildId); if (!build) throw new Error('EnvironmentBuild không tồn tại.');
  const env = await TestEnvironment.findById(build.environment); if (!env) throw new Error('TestEnvironment không tồn tại.');
  const started = Date.now(); build.startedAt = new Date(); env.status = 'Provisioning'; env.lastError = ''; await Promise.all([build.save(), env.save()]); let dir;
  try {
    if (env.kind === 'StaticUrl') { build.status = 'HealthChecking'; build.progress = 70; await build.save(); const health = await healthCheck(env.targetUrl, build, 20000); if (!health.ok) throw new Error(`Target URL không healthy: ${health.error}`); }
    else {
      if (!(await dockerStatus()).available) throw new Error('Docker Engine chưa sẵn sàng.');
      const integration = await IntegrationConnection.findById(env.integration).select('+credentialCiphertext'); if (!integration) throw new Error('Thiếu GitHub integration.');
      const token = decryptCredential(integration.credentialCiphertext); dir = path.join(workRoot, String(build._id)); await fs.mkdir(workRoot, { recursive: true }); await fs.rm(dir, { recursive: true, force: true });
      build.status = 'Cloning'; build.progress = 10; await build.save(); await progress(10);
      const authArg = `http.extraHeader=AUTHORIZATION: bearer ${token}`;
      const cloneArgs = build.pullRequestNumber ? ['-c', authArg, 'clone', '--depth', '50', env.repository.cloneUrl, dir] : ['-c', authArg, 'clone', '--depth', '50', '--branch', build.ref || 'main', env.repository.cloneUrl, dir];
      const clone = await command('git', cloneArgs, { timeout: 240000 }); await append(build, clone.stdout || clone.stderr);
      if (build.pullRequestNumber) { await command('git', ['-c', authArg, 'fetch', 'origin', `pull/${build.pullRequestNumber}/head`], { cwd: dir }); await command('git', ['checkout', 'FETCH_HEAD'], { cwd: dir }); }
      else if (build.commitSha) await command('git', ['checkout', build.commitSha], { cwd: dir });
      const actualSha = (await command('git', ['rev-parse', 'HEAD'], { cwd: dir })).stdout.trim(); build.commitSha = actualSha; env.repository.commitSha = actualSha;
      const runtime = await detectRuntime(dir, env.docker || {}); await append(build, `Detected ${runtime.mode}: ${runtime.composeFile || runtime.dockerfile}`);
      build.status = 'Building'; build.progress = 30; await build.save(); await progress(30);
      const name = `etms-${String(env._id).toLowerCase()}`; const networkName = `${name}-net`;
      await docker.getContainer(name).remove({ force: true }).catch(() => null); await docker.getNetwork(networkName).remove().catch(() => null); await docker.createNetwork({ Name: networkName, Driver: 'bridge' });
      const secrets = await EnvironmentSecret.find({ environment: env._id }).select('+valueCiphertext'); const envArgs = secrets.flatMap((item) => ['-e', `${item.name}=${decryptCredential(item.valueCiphertext)}`]); let containerId;
      if (runtime.mode === 'compose') { const result = await command('docker', ['compose', '-f', runtime.composeFile, '-p', name, 'up', '-d', '--build'], { cwd: dir, timeout: 1200000 }); await append(build, result.stdout || result.stderr); containerId = (await command('docker', ['compose', '-f', runtime.composeFile, '-p', name, 'ps', '-q', runtime.service], { cwd: dir })).stdout.trim(); }
      else { const imageTag = `${name}:${actualSha.slice(0, 12)}`; build.imageTag = imageTag; const result = await command('docker', ['build', '-f', runtime.dockerfile, '-t', imageTag, runtime.context], { cwd: dir, timeout: 1200000 }); await append(build, result.stdout || result.stderr); containerId = (await command('docker', ['run', '-d', '--name', name, '--network', networkName, '--memory', '1g', '--cpus', '1', '--pids-limit', '256', '--security-opt', 'no-new-privileges', ...envArgs, '-p', `127.0.0.1::${env.docker.containerPort}`, imageTag])).stdout.trim(); }
      if (!containerId) throw new Error('Không xác định được container ID.');
      build.status = 'Starting'; build.progress = 65; build.containerId = containerId; build.networkId = networkName; await build.save(); await progress(65);
      const container = docker.getContainer(containerId); const info = await container.inspect(); const binding = info.NetworkSettings.Ports?.[`${env.docker.containerPort}/tcp`]?.[0]; if (!binding?.HostPort) throw new Error(`Container chưa publish port ${env.docker.containerPort}.`);
      env.docker.containerId = containerId; env.docker.hostPort = Number(binding.HostPort); env.docker.imageTag = build.imageTag; env.docker.networkName = networkName;
      env.targetUrl = `http://${process.env.DOCKER_TARGET_HOST || '127.0.0.1'}:${binding.HostPort}${env.healthCheckPath || '/'}`; build.status = 'HealthChecking'; build.progress = 80; await Promise.all([build.save(), env.save()]); await progress(80);
      const health = await healthCheck(env.targetUrl, build, Number(env.healthCheckTimeoutMs || 90000)); if (!health.ok) throw new Error(`Health check thất bại: ${health.error}`);
      const logs = await container.logs({ stdout: true, stderr: true, tail: 1000 }); await fs.mkdir(artifactRoot, { recursive: true }); const logPath = path.join(artifactRoot, `${build._id}-container.log`); await fs.writeFile(logPath, logs);
      await ExecutionArtifact.create({ project: env.project, environmentBuild: build._id, source: 'Docker', artifactType: 'Log', name: 'container.log', mimeType: 'text/plain', uri: logPath, size: logs.length, checksum: crypto.createHash('sha256').update(logs).digest('hex') });
    }
    build.status = 'Ready'; build.progress = 95; env.status = 'Ready'; env.readyAt = new Date(); env.lastHealthCheckAt = new Date(); env.healthCheckStatus = 'Healthy';
    if (env.autoAnalyze) { try { env.latestWebAnalysis = await require('./webAnalyzerService').analyzeWebPage({ targetUrl: env.targetUrl, artifactNamespace: String(env._id), allowPrivate: env.kind === 'DockerGitHub' }); } catch (error) { await append(build, `Web Analyzer warning: ${error.message}`); } }
    build.progress = 100; build.completedAt = new Date(); build.durationMs = Date.now() - started; await Promise.all([build.save(), env.save()]); await progress(100);
    if (env.expiresAt) require('./queueService').enqueueEnvironmentCleanup(env._id, Math.max(0, new Date(env.expiresAt).getTime() - Date.now())).catch(console.error);
    if (env.autoRetest) {
      const { AutomationScript } = require('../models'); const scripts = await AutomationScript.find({ project: env.project, status: 'Approved' }).sort('-createdAt'); const latest = new Map(); scripts.forEach((script) => { if (!latest.has(String(script.testCase))) latest.set(String(script.testCase), script); });
      for (const script of latest.values()) await require('./multiEngineRunnerService').createAutomationRun({ scriptId: script._id, environmentId: env._id, userId: env.createdBy });
    }
    return { environmentId: env._id, buildId: build._id, targetUrl: env.targetUrl };
  } catch (error) { build.status = 'Failed'; build.error = safeLog(error.stderr || error.message); build.completedAt = new Date(); build.durationMs = Date.now() - started; env.status = 'Failed'; env.lastError = build.error; env.healthCheckStatus = 'Unhealthy'; await append(build, `FAILED: ${build.error}`); await Promise.all([build.save(), env.save()]); throw error; }
  finally { if (dir && String(process.env.KEEP_ENVIRONMENT_SOURCE).toLowerCase() !== 'true') await fs.rm(dir, { recursive: true, force: true }).catch(() => null); }
}
async function cleanupEnvironment(environmentId) { const env = await TestEnvironment.findById(environmentId); if (!env) return { removed: false }; const projectName = `etms-${String(env._id).toLowerCase()}`; if (env.docker?.containerId) await docker.getContainer(env.docker.containerId).remove({ force: true, v: true }).catch(() => null); const composeContainers = await docker.listContainers({ all: true, filters: { label: [`com.docker.compose.project=${projectName}`] } }).catch(() => []); await Promise.all(composeContainers.map((x) => docker.getContainer(x.Id).remove({ force: true, v: true }).catch(() => null))); if (env.docker?.networkName) await docker.getNetwork(env.docker.networkName).remove().catch(() => null); const composeNetworks = await docker.listNetworks({ filters: { label: [`com.docker.compose.project=${projectName}`] } }).catch(() => []); await Promise.all(composeNetworks.map((x) => docker.getNetwork(x.Id).remove().catch(() => null))); if (env.docker?.imageTag) await docker.getImage(env.docker.imageTag).remove({ force: true }).catch(() => null); env.status = 'Stopped'; if (env.kind !== 'StaticUrl') env.targetUrl = ''; await env.save(); return { removed: true }; }
const enqueueProvision = async (environmentId, requestedBy) => createEnvironmentBuild({ environment: environmentId, requestedBy });
module.exports = { dockerStatus, githubRequest, detectRuntime, createEnvironmentBuild, provisionBuild, cleanupEnvironment, enqueueProvision, stopEnvironment: cleanupEnvironment };
