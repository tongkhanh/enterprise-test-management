const { githubRequest } = require('./environmentService');
const { AppError } = require('../utils/http');

// Chỉ đọc tài liệu requirement/API theo mặc định. Source code không được tự động
// gửi tới AI vì repository có thể là private hoặc chứa bí mật thương mại.
const useful = /(^|\/)(readme|requirements?|specs?|stories?|docs?|api-docs?|openapi|swagger)(\/|\.|$)|\.(md|txt)$/i;
const ignored = /(^|\/)(node_modules|dist|build|coverage|vendor|\.git|public\/assets)(\/|$)|\.(lock|min\.js|map|png|jpe?g|gif|ico|woff2?|ttf|zip|pdf|docx?)$/i;
const systemSource = /(^|\/)(src|app|pages|routes|controllers|services|models|api|server|config|tests?)(\/|$)|(^|\/)(package\.json|docker-compose[^/]*\.ya?ml|dockerfile|openapi[^/]*\.ya?ml|swagger[^/]*\.ya?ml)$/i;
const sourceExtension = /\.(?:js|jsx|ts|tsx|mjs|cjs|py|java|go|php|rb|cs|html|vue|svelte|json|ya?ml)$/i;
// Filename filtering is only a safeguard, not a guarantee that files contain no secrets.
const sensitivePath = /(^|\/)(?:\.env(?:\.[^/]*)?|[^/]*(?:credentials?|secrets?|private[-_.]?key)[^/]*|id_rsa(?:\.pub)?)$|\.(?:pem|p12|pfx|key)$/i;

async function listRepositoryFiles({ integrationId, owner, repo, ref = 'HEAD', purpose = 'requirements', includeMetadata = false }) {
  const tree = await githubRequest(integrationId, `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`);
  const matcher = purpose === 'system' ? (item) => useful.test(item.path) || systemSource.test(item.path) || sourceExtension.test(item.path) : (item) => useful.test(item.path);
  const files = (tree.tree || []).filter((item) => item.type === 'blob' && item.size <= 250000 && matcher(item) && !ignored.test(item.path) && (purpose !== 'system' || !sensitivePath.test(item.path)))
    .map((item) => ({ path: item.path, sha: item.sha, size: item.size }));
  const result = purpose === 'system' ? files : files.slice(0, 500);
  return includeMetadata ? { items: result, total: result.length, truncated: tree.truncated === true } : result;
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
  if (!Array.isArray(paths) || !paths.length) throw new AppError('Hãy chọn các file source/tài liệu được phép dùng để phân tích E2E.', 400);
  const requested = [...new Set(paths)];
  if (requested.length > 40) throw new AppError('Chỉ có thể phân tích tối đa 40 tệp mỗi lần.', 400);
  const listing = await listRepositoryFiles({ integrationId, owner, repo, ref, purpose: 'system', includeMetadata: true });
  if (listing.truncated) throw new AppError('GitHub trả về danh sách tệp chưa đầy đủ; không thể xác minh lựa chọn an toàn. Hãy dùng repository hoặc commit nhỏ hơn.', 422);
  const allow = new Map(listing.items.map((item) => [item.path, item]));
  // The user must still explicitly select files: private source is never sent
  // to AI merely because it exists in the repository.
  const selected = requested.filter((item) => allow.has(item));
  if (selected.length !== requested.length) throw new AppError('Một số tệp đã chọn không còn tồn tại hoặc không được phép phân tích. Hãy chọn lại theo commit hiện tại.', 422);
  // Share the AI context budget across every explicit selection.  Previously
  // the loop stopped when the first large files filled the budget, which made
  // a “select all” action look as though later folders had not been selected.
  const totalBudget = 100000;
  const perFileBudget = Math.min(10000, Math.max(1000, Math.floor(totalBudget / selected.length)));
  const files = []; let total = 0;
  for (const filePath of selected) {
    const response = await githubRequest(integrationId, `/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}?ref=${encodeURIComponent(ref)}`);
    if (response.type !== 'file' || response.encoding !== 'base64') continue;
    const content = Buffer.from(String(response.content || '').replace(/\s/g, ''), 'base64').toString('utf8').replace(/\0/g, '');
    const excerpt = content.slice(0, Math.min(perFileBudget, totalBudget - total));
    if (!excerpt) continue;
    files.push({ path: filePath, sha: response.sha, size: response.size, excerpt }); total += excerpt.length;
    if (total >= totalBudget) break;
  }
  if (!files.length) throw new AppError('Không thể đọc các file đã chọn từ GitHub.', 422);
  const commit = await githubRequest(integrationId, `/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`);
  return { files, selectedPaths: selected, combinedText: files.map((file) => `\n--- FILE: ${file.path} ---\n${file.excerpt}`).join('\n').slice(0, totalBudget), commitSha: commit.sha || '', repository: `${owner}/${repo}`, ref };
}

module.exports = { listRepositoryFiles, buildRepositoryContext, buildSystemRepositoryContext };
