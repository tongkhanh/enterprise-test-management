const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

test('Playwright live reporter captures the real browser, hides input values and distinguishes assertion failures from execution errors', { skip: process.env.TEST_BROWSER !== 'true', timeout: 90000 }, async () => {
  let channel;
  const browser = await chromium.launch({ headless: true }).catch((error) => {
    if (process.platform === 'win32' && /Executable doesn't exist/.test(error.message)) { channel = 'msedge'; return chromium.launch({ headless: true, channel }); } throw error;
  }); await browser.close();
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'etms-live-'));
  try {
    const reporter = path.resolve('automation/playwrightLiveReporter.cjs');
    const library = require.resolve('@playwright/test');
    const cli = require.resolve('@playwright/test/cli');
    await fs.writeFile(path.join(directory, 'playwright.config.cjs'), `module.exports=${JSON.stringify({ workers: 1, retries: 0, timeout: 10000, reporter: [[reporter]], use: { channel, headless: true, launchOptions: { args: ['--remote-debugging-port=9222', '--remote-debugging-address=127.0.0.1'] } } })};`);
    const execute = async (source) => {
      await fs.writeFile(path.join(directory, 'fixture.spec.js'), `const {test,expect}=require(${JSON.stringify(library)});\n${source}`);
      return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [cli, 'test'], { cwd: directory, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        let logs = ''; child.stdout.on('data', (value) => { logs += value; }); child.stderr.on('data', (value) => { logs += value; }); child.on('error', reject); child.on('exit', (code) => resolve({ code, logs }));
      });
    };
    const passed = await execute(`test('passing', async ({page})=>{await page.goto('data:text/html,<input><h1>Products</h1>');await page.locator('input').fill('private-test-value');await page.waitForTimeout(1800);await expect(page.locator('h1')).toHaveText('Products');});`);
    assert.equal(passed.code, 0, passed.logs);
    const state = JSON.parse(await fs.readFile(path.join(directory, '.etms-live/state.json'), 'utf8'));
    assert.equal(state.status, 'Passed'); assert.equal(state.assertions[0].status, 'Passed');
    assert.ok((await fs.stat(path.join(directory, '.etms-live/frame.jpg'))).size > 1000);
    assert.ok(!JSON.stringify(state).includes('private-test-value'));
    const failed = await execute(`test('assertion',async({page})=>{await page.setContent('<h1>Actual</h1>');await expect(page.locator('h1')).toHaveText('Expected',{timeout:200});});`);
    assert.equal(failed.code, 1, failed.logs);
    assert.equal(JSON.parse(await fs.readFile(path.join(directory, '.etms-live/state.json'), 'utf8')).status, 'Failed');
    const error = await execute(`test('action error',async({page})=>{await page.locator('#missing').click({timeout:200});});`);
    assert.equal(error.code, 1, error.logs);
    assert.equal(JSON.parse(await fs.readFile(path.join(directory, '.etms-live/state.json'), 'utf8')).status, 'Error');
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
