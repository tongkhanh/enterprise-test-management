const assert = require('node:assert/strict');
const http = require('node:http');
const { chromium } = require('playwright');
const { findBrowserExecutable } = require('../services/webAnalyzerService');
const { _test } = require('../services/automationRunnerService');
const { _test: jiraTest } = require('../services/jiraService');

const run = async () => {
  assert.equal(_test.resolveValue('Xin chào $account.name', { account: { name: 'Tester' } }), 'Xin chào Tester');
  const jiraDescription = jiraTest.adfDocument([{ title: 'Root cause', text: 'API trả HTTP 500' }]);
  assert.equal(jiraDescription.type, 'doc');
  assert.match(jiraDescription.content[0].content[0].text, /HTTP 500/);
  const server = http.createServer((_, response) => {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(`<!doctype html><html lang="vi"><head><meta charset="utf-8"></head><body>
    <label>Email <input aria-label="Email"></label>
    <button type="button" onclick="document.querySelector('#result').textContent='Đăng nhập thành công'">Đăng nhập</button>
    <p id="result">Chưa đăng nhập</p>
  </body></html>`);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const browser = await chromium.launch({ headless: true, ...(findBrowserExecutable() ? { executablePath: findBrowserExecutable() } : {}) });
  try {
    const page = await browser.newPage(); await page.goto(`http://127.0.0.1:${port}`);
    await _test.executeStep({ page, testData: { email: 'qa@example.test' }, targetUrl: page.url(), step: { automationAction: 'fill', locator: { strategy: 'role', role: 'textbox', name: 'Email' }, value: '$email' } });
    assert.equal(await page.getByRole('textbox', { name: 'Email' }).inputValue(), 'qa@example.test');
    await _test.executeStep({ page, testData: {}, targetUrl: page.url(), step: { automationAction: 'click', locator: { strategy: 'role', role: 'button', name: 'Đăng nhập' } } });
    await _test.executeStep({ page, testData: {}, targetUrl: page.url(), step: { automationAction: 'assertText', locator: { strategy: 'css', value: '#result' }, value: 'thành công' } });
    console.log('OK: Playwright Runner thực thi fill, click, assertText và biến test data.');
  } finally {
    await browser.close(); await new Promise((resolve) => server.close(resolve));
  }
};

run().catch((error) => { console.error(error); process.exitCode = 1; });
