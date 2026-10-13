const { AutomationScript, TestEnvironment, Project, TestCase, IntegrationConnection } = require('../models');
const { AppError, send } = require('../utils/http');
const { generateScript, validateScript } = require('../services/automationScriptService');
const { dockerStatus, githubRequest, enqueueProvision, stopEnvironment } = require('../services/environmentService');
const { assertProjectAccess } = require('../services/projectAccessService');
const { assertWorkspaceAccess } = require('../services/workspaceAccessService');
const { ROLE_NAMES } = require('../config/roles');
const { listRepositoryFiles } = require('../services/repositoryContextService');

async function access(req, projectId) {
  return (await assertProjectAccess(req.user, projectId)).project;
}
async function githubAccess(req) { const connection = await IntegrationConnection.findById(req.params.integrationId); if (!connection || connection.provider !== 'GitHub') throw new AppError('GitHub integration không tồn tại.', 404); if (connection.project) await access(req, connection.project); else await assertWorkspaceAccess(req.user, connection.workspace, { manage: true, permission: 'integration:manage' }); }

const listScripts = async (req, res) => {
  if (!req.query.project) throw new AppError('project là bắt buộc.', 400);
  await access(req, req.query.project);
  send(res, await AutomationScript.find({ project: req.query.project }).populate('testCase', 'title status').populate('createdBy', 'fullName').sort('-createdAt').limit(100));
};
const createScript = async (req, res) => {
  const testCase = await TestCase.findById(req.body.testCase).populate('testSuite', 'project');
  if (!testCase) throw new AppError('Test Case không tồn tại.', 404);
  await access(req, testCase.testSuite.project);
  const script = await generateScript({ testCaseId: req.body.testCase, engine: req.body.engine, userId: req.user._id });
  send(res, script, 201);
};
const downloadScript = async (req, res) => {
  const script = await AutomationScript.findById(req.params.id);
  if (!script) throw new AppError('Script không tồn tại.', 404);
  await access(req, script.project); res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename="${script.filename}"`); res.send(script.code);
};
const validate = async (req, res) => { const script = await AutomationScript.findById(req.params.id); if (!script) throw new AppError('Script không tồn tại.', 404); await access(req, script.project); if (typeof req.body.code === 'string') script.code = req.body.code; send(res, await validateScript(script)); };
const reviewScript = async (req, res) => { const script = await AutomationScript.findById(req.params.id); if (!script) throw new AppError('Script không tồn tại.', 404); await access(req, script.project); if (!['Approved', 'Rejected'].includes(req.body.status)) throw new AppError('status phải là Approved hoặc Rejected.', 400); if (req.body.status === 'Approved' && script.status !== 'Validated') throw new AppError('Script phải Validate thành công trước khi duyệt.', 409); if (req.body.status === 'Rejected' && !String(req.body.reviewNote || '').trim()) throw new AppError('Cần nhập lý do từ chối.', 400); script.status = req.body.status; script.reviewNote = String(req.body.reviewNote || '').trim().slice(0, 2000); script.approvedBy = req.body.status === 'Approved' ? req.user._id : null; script.approvedAt = req.body.status === 'Approved' ? new Date() : null; await script.save(); send(res, script); };
const listEnvironments = async (req, res) => {
  if (!req.query.project) throw new AppError('project là bắt buộc.', 400);
  await access(req, req.query.project);
  send(res, await TestEnvironment.find({ project: req.query.project }).populate('integration', 'displayName status').sort('-createdAt'));
};
const createEnvironment = async (req, res) => {
  await access(req, req.body.project);
  if (!req.body.name || !req.body.kind) throw new AppError('name và kind là bắt buộc.', 400);
  if (req.body.kind === 'StaticUrl' && !/^https?:\/\//i.test(req.body.targetUrl || '')) throw new AppError('Target URL phải bắt đầu bằng http:// hoặc https://.', 400);
  let repository; let docker;
  if (req.body.kind === 'DockerGitHub') {
    const fullName = String(req.body.repository?.fullName || '');
    const ref = String(req.body.repository?.ref || 'main');
    if (!req.body.integration || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(fullName)) throw new AppError('GitHub integration và repository hợp lệ là bắt buộc.', 400);
    const connection = await IntegrationConnection.findById(req.body.integration); if (!connection || connection.provider !== 'GitHub' || (connection.project && String(connection.project) !== String(req.body.project))) throw new AppError('GitHub integration không thuộc Project này.', 409);
    if (!/^(?!-)[A-Za-z0-9._\/-]+$/.test(ref) || ref.includes('..')) throw new AppError('Tên branch/ref không hợp lệ.', 400);
    const dockerfile = String(req.body.docker?.dockerfile || 'Dockerfile');
    const context = String(req.body.docker?.context || '.');
    if (dockerfile.includes('..') || context.includes('..') || /^[/\\]/.test(dockerfile) || /^[/\\]/.test(context)) throw new AppError('Docker path phải nằm trong repository.', 400);
    const commitSha = String(req.body.repository?.commitSha || ''); if (commitSha && !/^[a-f0-9]{7,40}$/i.test(commitSha)) throw new AppError('Commit SHA không hợp lệ.', 400);
    repository = { fullName, cloneUrl: `https://github.com/${fullName}.git`, ref, commitSha, pullRequestNumber: req.body.repository?.pullRequestNumber || null };
    docker = { dockerfile, context, containerPort: Number(req.body.docker?.containerPort || 3000) };
  }
  const env = await TestEnvironment.create({ project: req.body.project, name: req.body.name, kind: req.body.kind, targetUrl: req.body.targetUrl || '', integration: req.body.integration || null, repository, docker, healthCheckPath: req.body.healthCheckPath || '/', expiresAt: req.body.expiresAt || null, autoBuildOnPush: req.body.autoBuildOnPush !== false, autoBuildOnPullRequest: req.body.autoBuildOnPullRequest !== false, autoRetest: Boolean(req.body.autoRetest), autoAnalyze: req.body.autoAnalyze !== false, createdBy: req.user._id });
  send(res, env, 201);
};
const provisionEnvironment = async (req, res) => {
  const env = await TestEnvironment.findById(req.params.id); if (!env) throw new AppError('Environment không tồn tại.', 404);
  await access(req, env.project); if (env.status === 'Provisioning') throw new AppError('Environment đang được dựng.', 409);
  env.status = 'Draft'; await env.save(); const build = await enqueueProvision(env._id, req.user._id); send(res, { environment: env, build }, 202, { message: 'Đã đưa EnvironmentBuild vào hàng đợi.' });
};
const stop = async (req, res) => { const env = await TestEnvironment.findById(req.params.id); if (!env) throw new AppError('Environment không tồn tại.', 404); await access(req, env.project); send(res, await stopEnvironment(env)); };
const status = async (_req, res) => send(res, await dockerStatus());
const repos = async (req, res) => { await githubAccess(req); send(res, (await githubRequest(req.params.integrationId, '/user/repos?per_page=100&sort=updated')).map((x) => ({ id: x.id, fullName: x.full_name, cloneUrl: x.clone_url, defaultBranch: x.default_branch, private: x.private }))); };
const branches = async (req, res) => { await githubAccess(req); send(res, (await githubRequest(req.params.integrationId, `/repos/${req.params.owner}/${req.params.repo}/branches?per_page=100`)).map((x) => ({ name: x.name, sha: x.commit.sha }))); };
const commits = async (req, res) => { await githubAccess(req); send(res, (await githubRequest(req.params.integrationId, `/repos/${req.params.owner}/${req.params.repo}/commits?per_page=50${req.query.sha ? `&sha=${encodeURIComponent(req.query.sha)}` : ''}`)).map((x) => ({ sha: x.sha, message: x.commit.message, authoredAt: x.commit.author?.date, author: x.author?.login || x.commit.author?.name, url: x.html_url }))); };
const pulls = async (req, res) => { await githubAccess(req); send(res, (await githubRequest(req.params.integrationId, `/repos/${req.params.owner}/${req.params.repo}/pulls?state=open&per_page=50`)).map((x) => ({ number: x.number, title: x.title, headRef: x.head.ref, headSha: x.head.sha, baseRef: x.base.ref, author: x.user?.login, url: x.html_url }))); };
const runtimeFiles = async (req, res) => { await githubAccess(req); const tree = await githubRequest(req.params.integrationId, `/repos/${req.params.owner}/${req.params.repo}/git/trees/${encodeURIComponent(req.query.ref || 'HEAD')}?recursive=1`); const names = new Set(['Dockerfile', 'compose.yaml', 'compose.yml', 'docker-compose.yml', 'docker-compose.yaml']); send(res, (tree.tree || []).filter((x) => names.has(x.path.split('/').pop())).map((x) => ({ path: x.path, type: x.path.toLowerCase().includes('compose') ? 'Compose' : 'Dockerfile', sha: x.sha }))); };
const sourceFiles = async (req, res) => { await githubAccess(req); send(res, await listRepositoryFiles({ integrationId: req.params.integrationId, owner: req.params.owner, repo: req.params.repo, ref: req.query.ref || 'HEAD' })); };

module.exports = { listScripts, createScript, downloadScript, validate, reviewScript, listEnvironments, createEnvironment, provisionEnvironment, stop, status, repos, branches, commits, pulls, runtimeFiles, sourceFiles };
