const { githubRequest } = require('./environmentService');
const { AppError } = require('../utils/http');

// Chỉ đọc tài liệu requirement/API theo mặc định. Source code không được tự động
// gửi tới AI vì repository có thể là private hoặc chứa bí mật thương mại.
const useful = /(^|\/)(readme|requirements?|specs?|stories?|docs?|api-docs?|openapi|swagger)(\/|\.|$)|\.(md|txt)$/i;
const ignored = /(^|\/)(node_modules|dist|build|coverage|vendor|\.git|public\/assets)(\/|$)|\.(lock|min\.js|map|png|jpe?g|gif|ico|woff2?|ttf|zip|pdf|docx?)$/i;
const systemSource = /(^|\/)(src|app|pages|routes|controllers|services|models|api|server|config|tests?)(\/|$)|(^|\/)(package\.json|docker-compose[^/]*\.ya?ml|dockerfile|openapi[^/]*\.ya?ml|swagger[^/]*\.ya?ml)$/i;

async function listRepositoryFiles({ integrationId, owner, repo, ref = 'HEAD', purpose = 'requirements' }) {
  const tree = await githubRequest(integrationId, `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`);
  const matcher = purpose === 'system' ? (item) => useful.test(item.path) || systemSource.test(item.path) : (item) => useful.test(item.path);
  return (tree.tree || []).filter((item) => item.type === 'blob' && item.size <= 250000 && matcher(item) && !ignored.test(item.path))
    .slice(0, 500).map((item) => ({ path: item.path, sha: item.sha, size: item.size }));
}

async function buildRepositoryContext({ integrationId, owner, repo, ref = 'HEAD', paths = [] }) {
  const all = await listRepositoryFiles({ integrationId, owner, repo, ref });
  const allow = new Map(all.map((item) => [item.path, item]));
  const selected = paths.filter((path) => allow.has(path)).slice(0, 20);
  if (!paths.length) throw new AppError('Hãy chọn rõ các file GitHub được phép dùng làm ngữ cảnh AI.', 400);
  if (!selected.length) throw new AppError('Không tìm thấy file requirement/source phù hợp trong repository.', 422);
  const files = []; let total = 0;
  for (const filePath of selected) {
    const response = await githubRequest(integrationId, `/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}?ref=${encodeURIComponent(ref)}`);
    if (response.type !== 'file' || response.encoding !== 'base64') continue;
    const content = Buffer.from(String(response.content || '').replace(/\s/g, ''), 'base64').toString('utf8').replace(/\0/g, '');
    const excerpt = content.slice(0, Math.min(12000, 60000 - total));
    if (!excerpt) continue;
    files.push({ path: filePath, sha: response.sha, size: response.size, excerpt }); total += excerpt.length;
    if (total >= 60000) break;
  }
  if (!files.length) throw new AppError('Không thể đọc nội dung file đã chọn từ GitHub.', 422);
  const combinedText = files.map((file) => `\n--- FILE: ${file.path} ---\n${file.excerpt}`).join('\n').slice(0, 60000);
  const commit = await githubRequest(integrationId, `/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`);
  return { files, combinedText, commitSha: commit.sha || '', repository: `${owner}/${repo}`, ref };
}

async function buildSystemRepositoryContext({ integrationId, owner, repo, ref = 'HEAD', paths = [] }) {
  const all = await listRepositoryFiles({ integrationId, owner, repo, ref, purpose: 'system' });
  const allow = new Map(all.map((item) => [item.path, item]));
  // The user must still explicitly select files: private source is never sent
  // to AI merely because it exists in the repository.
  const selected = paths.filter((item) => allow.has(item)).slice(0, 40);
  if (!selected.length) throw new AppError('Hãy chọn các file source/tài liệu được phép dùng để phân tích E2E.', 400);
  const files = []; let total = 0;
  for (const filePath of selected) {
    const response = await githubRequest(integrationId, `/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}?ref=${encodeURIComponent(ref)}`);
    if (response.type !== 'file' || response.encoding !== 'base64') continue;
    const content = Buffer.from(String(response.content || '').replace(/\s/g, ''), 'base64').toString('utf8').replace(/\0/g, '');
    const excerpt = content.slice(0, Math.min(10000, 100000 - total));
    if (!excerpt) continue;
    files.push({ path: filePath, sha: response.sha, size: response.size, excerpt }); total += excerpt.length;
    if (total >= 100000) break;
  }
  if (!files.length) throw new AppError('Không thể đọc các file đã chọn từ GitHub.', 422);
  const commit = await githubRequest(integrationId, `/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`);
  return { files, combinedText: files.map((file) => `\n--- FILE: ${file.path} ---\n${file.excerpt}`).join('\n').slice(0, 100000), commitSha: commit.sha || '', repository: `${owner}/${repo}`, ref };
}

module.exports = { listRepositoryFiles, buildRepositoryContext, buildSystemRepositoryContext };
