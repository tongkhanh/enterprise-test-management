const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { chromium } = require('playwright');
const { createRuntime } = require('../../manual-browser/runtime');

test('remote browser interacts with a frame-blocked website, reconnects without losing login and isolates sessions', { skip: process.env.TEST_BROWSER !== 'true', timeout: 60000 }, async () => {
  const fixture = http.createServer((_req, res) => {
    res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
    res.end('<html><body><h1>Manual fixture</h1><input id="name" style="position:absolute;left:20px;top:100px"><button id="login" style="position:absolute;left:20px;top:160px" onclick="localStorage.setItem(\'user\',document.querySelector(\'#name\').value);document.querySelector(\'h1\').textContent=\'Welcome \'+localStorage.user">Login</button></body></html>');
  });
  await new Promise((resolve) => fixture.listen(0, '127.0.0.1', resolve));
  const targetUrl = `http://127.0.0.1:${fixture.address().port}`;
  const launch = () => chromium.launch({ headless: true }).catch((error) => {
    if (process.platform === 'win32' && /Executable doesn't exist/.test(error.message)) return chromium.launch({ headless: true, channel: 'msedge' }); throw error;
  });
  const runtimes = [];
  try {
    for (const token of ['first-secret', 'second-secret']) {
      const runtime = await createRuntime({ token, targetUrl, launch, validateUrl: async () => {} });
      await new Promise((resolve) => runtime.server.listen(0, '127.0.0.1', resolve)); runtimes.push(runtime);
    }
    const runtime = runtimes[0]; const base = `http://127.0.0.1:${runtime.server.address().port}`;
    const headers = { Authorization: 'Bearer first-secret', 'Content-Type': 'application/json' };
    assert.equal((await fetch(`${base}/health`)).status, 401);
    assert.equal((await fetch(`${base}/health`, { headers: { Authorization: 'Bearer second-secret' } })).status, 401);
    const page = runtime.browser.contexts()[0].pages()[0]; await page.locator('#name').waitFor();
    const input = async (events) => { const r = await fetch(`${base}/input`, { method: 'POST', headers, body: JSON.stringify({ events }) }); assert.equal(r.status, 200); };
    await input([{ type: 'pointer', event: 'down', x: 45, y: 110 }, { type: 'pointer', event: 'up', x: 45, y: 110 }, { type: 'text', text: 'QA tester' }, { type: 'pointer', event: 'down', x: 45, y: 170 }, { type: 'pointer', event: 'up', x: 45, y: 170 }]);
    assert.equal(await page.locator('h1').textContent(), 'Welcome QA tester');
    const screenshot = await fetch(`${base}/screenshot`, { headers });
    assert.equal(screenshot.headers.get('Content-Type'), 'image/png'); assert.ok((await screenshot.arrayBuffer()).byteLength > 1000);
    const abort = new AbortController(); const stream = await fetch(`${base}/stream`, { headers, signal: abort.signal });
    const reader = stream.body.getReader(); let data = '';
    while (!data.includes('event: frame')) data += Buffer.from((await reader.read()).value).toString();
    abort.abort();
    assert.equal((await fetch(`${base}/health`, { headers })).status, 200);
    assert.equal(await page.evaluate(() => localStorage.user), 'QA tester');
    const otherPage = runtimes[1].browser.contexts()[0].pages()[0];
    assert.equal(await otherPage.evaluate(() => localStorage.user), undefined);
  } finally {
    for (const runtime of runtimes) { await runtime.close(); await new Promise((resolve) => runtime.server.close(resolve)); }
    await new Promise((resolve) => fixture.close(resolve));
  }
});
