// Disposable Docker smoke test; does not load .env, contact Atlas, or create QA results.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const Docker = require('dockerode');

async function main() {
  const docker = new Docker(); const id = crypto.randomBytes(12).toString('hex');
  const root = path.resolve('storage/multi-engine'); const directory = path.join(root, id, 'attempt-1');
  const volume = process.env.RUNNER_STORAGE_VOLUME;
  if (!volume) throw new Error('Run this smoke test inside the Compose automation worker.');
  let container; let timeout;
  try {
    await fs.mkdir(directory, { recursive: true });
    await fs.copyFile(path.resolve(__dirname, 'playwrightLiveReporter.cjs'), path.join(directory, 'etms-live-reporter.cjs'));
    await fs.writeFile(path.join(directory, 'playwright.config.cjs'), `module.exports={workers:1,reporter:[['./etms-live-reporter.cjs']],use:{headless:true,launchOptions:{args:['--remote-debugging-port=9222','--remote-debugging-address=127.0.0.1']}}};`);
    await fs.writeFile(path.join(directory, 'fixture.spec.js'), `const {test,expect}=require('@playwright/test');test('isolated Docker smoke',async({page})=>{await page.goto('data:text/html,<input><h1>Products</h1>');await page.locator('input').fill('synthetic-private-value');await page.waitForTimeout(2500);await expect(page.locator('h1')).toHaveText('Products');});`);
    container = await docker.createContainer({ Image: 'etms-playwright-runner:local', Labels: { 'etms.automation-smoke': 'true' }, Cmd: ['sh', '-lc', 'ln -s /app/node_modules /workspace/node_modules && node /app/node_modules/@playwright/test/cli.js test "$SCRIPT_FILE"'], WorkingDir: '/workspace', Env: ['SCRIPT_FILE=fixture.spec.js'], HostConfig: { Mounts: [{ Type: 'volume', Source: volume, Target: '/workspace', VolumeOptions: { Subpath: `multi-engine/${id}/attempt-1` } }], Memory: 1536 * 1024 * 1024, NanoCpus: 1500000000, PidsLimit: 256, SecurityOpt: ['no-new-privileges'] } });
    await container.start();
    const result = await Promise.race([container.wait(), new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Docker smoke timed out')), 60000); })]); clearTimeout(timeout);
    assert.equal(result.StatusCode, 0, (await container.logs({ stdout: true, stderr: true })).toString());
    const state = JSON.parse(await fs.readFile(path.join(directory, '.etms-live/state.json'), 'utf8'));
    assert.equal(state.status, 'Passed'); assert.equal(state.assertions[0].status, 'Passed');
    assert.ok(!JSON.stringify(state).includes('synthetic-private-value'));
    assert.ok((await fs.stat(path.join(directory, '.etms-live/frame.jpg'))).size > 1000);
    console.log('PASS: managed Docker runner, actual Chromium frame, assertion outcome, and redacted progress. No Atlas records created.');
  } finally {
    clearTimeout(timeout); await container?.remove({ force: true }).catch(() => {});
    const target = path.resolve(root, id);
    if (path.dirname(target) === root) await fs.rm(target, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
