const http = require('node:http');
const fs = require('node:fs').promises;
const path = require('node:path');

process.env.WEB_ANALYZER_ALLOW_PRIVATE = 'true';
process.env.WEB_ANALYZER_ALLOWED_HOSTS = '';
const { analyzeWebPage, validateTargetUrl, isPrivateAddress } = require('../services/webAnalyzerService');

const html = `<!doctype html><html lang="vi"><head><title>Đăng nhập ETMS</title><meta name="description" content="Trang đăng nhập kiểm thử"></head><body>
  <main><h1>Đăng nhập</h1><form action="/login" method="post">
    <label for="email">Email</label><input id="email" name="email" type="email" required placeholder="qa@example.com">
    <label for="password">Mật khẩu</label><input id="password" name="password" type="password" required minlength="8">
    <button type="submit">Đăng nhập</button>
  </form><a href="/forgot-password">Quên mật khẩu</a></main>
</body></html>`;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
});

const main = async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  let result;
  try {
    if (!isPrivateAddress('127.0.0.1') || !isPrivateAddress('10.0.0.1') || !isPrivateAddress('::1')) throw new Error('Bộ nhận diện private IP không hoạt động.');
    let privateBlocked = false;
    try { await validateTargetUrl(`http://127.0.0.1:${port}/login`, { allowPrivate: false }); } catch (error) { privateBlocked = error.statusCode === 403; }
    if (!privateBlocked) throw new Error('SSRF guard không chặn loopback khi private host bị tắt.');
    result = await analyzeWebPage({ targetUrl: `http://127.0.0.1:${port}/login`, artifactNamespace: 'check' });
    if (result.page.title !== 'Đăng nhập ETMS') throw new Error('Không đọc đúng page title.');
    if (result.page.inputs.length !== 2) throw new Error(`Mong đợi 2 input, nhận ${result.page.inputs.length}.`);
    if (!result.page.buttons.some((button) => button.text === 'Đăng nhập')) throw new Error('Không phát hiện nút Đăng nhập.');
    if (!result.page.inputs.every((input) => input.locator)) throw new Error('Input chưa có locator gợi ý.');
    console.log(`OK: Web Analyzer đọc ${result.page.inputs.length} input, ${result.page.buttons.length} button và ${result.page.links.length} link.`);
  } finally {
    server.close();
    if (result?.screenshotUrl) {
      const filename = result.screenshotUrl.split('/').pop();
      await fs.unlink(path.join(__dirname, '..', 'storage', 'web-analysis', filename)).catch(() => null);
    }
  }
};

main().catch((error) => { console.error(error); process.exitCode = 1; });
