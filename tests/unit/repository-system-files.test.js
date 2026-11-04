const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const environmentService = require('../../services/environmentService');

let repositoryTree = [];
let truncated = false;
const reads = [];
mock.method(environmentService, 'githubRequest', async (_integration, endpoint) => {
  if (endpoint.includes('/git/trees/')) return { tree: repositoryTree, truncated };
  if (endpoint.includes('/contents/')) {
    reads.push(endpoint);
    return { type: 'file', encoding: 'base64', content: Buffer.from('safe source').toString('base64'), sha: 'file-sha', size: 11 };
  }
  if (endpoint.includes('/commits/')) return { sha: 'commit-sha' };
  throw new Error(`Unexpected endpoint: ${endpoint}`);
});
const { listRepositoryFiles, buildSystemRepositoryContext } = require('../../services/repositoryContextService');
const { analyzeGithub } = require('../../controllers/e2eController');
const options = { integrationId: 'connection', owner: 'owner', repo: 'repo', ref: 'main' };

test('system listing supports more than 500 files and excludes common secret paths', async () => {
  repositoryTree = Array.from({ length: 1001 }, (_, index) => ({ type: 'blob', path: `src/file-${index}.js`, sha: String(index), size: 100 }));
  repositoryTree.push({ type: 'blob', path: 'src/.env.production', size: 10 }, { type: 'blob', path: 'src/credentials.json', size: 10 }, { type: 'blob', path: 'src/key.pem', size: 10 });
  truncated = false;
  const result = await listRepositoryFiles({ ...options, purpose: 'system', includeMetadata: true });
  assert.equal(result.total, 1001);
  assert.equal(result.truncated, false);
  assert.ok(result.items.some((item) => item.path === 'src/file-1000.js'));
  assert.ok(!result.items.some((item) => /env|credentials|\.pem/.test(item.path)));
  const context = await buildSystemRepositoryContext({ ...options, paths: ['src/file-1000.js'] });
  assert.equal(context.files[0].path, 'src/file-1000.js');
});

test('analysis rejects incomplete trees, out-of-scope paths and selections over 40 before reading files', async () => {
  repositoryTree = [{ type: 'blob', path: 'src/app.js', size: 100 }];
  reads.length = 0;
  truncated = true;
  await assert.rejects(buildSystemRepositoryContext({ ...options, paths: ['src/app.js'] }), /chưa đầy đủ/);
  truncated = false;
  await assert.rejects(buildSystemRepositoryContext({ ...options, paths: ['src/app.js', 'src/.env'] }), /không còn tồn tại hoặc không được phép/);
  await assert.rejects(buildSystemRepositoryContext({ ...options, paths: Array.from({ length: 41 }, (_, index) => `src/${index}.js`) }), /tối đa 40/);
  assert.equal(reads.length, 0);
});

test('E2E GitHub analysis requires explicit AI sharing confirmation before repository access', async () => {
  reads.length = 0;
  await assert.rejects(analyzeGithub({ body: { projectId: 'p', name: 'Profile', integrationId: 'i', repository: 'owner/repo', ref: 'main', paths: ['src/app.js'] } }, {}), /Cần xác nhận quyền gửi/);
  assert.equal(reads.length, 0);
});
