// Browser regression check against isolated mock data; never writes to a real project.
const express = require('express');
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

async function main() {
  const app = express();
  app.use('/studio', express.static(path.resolve(__dirname, '../public/studio')));
  app.use((_req, res) => res.sendFile(path.resolve(__dirname, '../public/studio/index.html')));
  const server = await new Promise((resolve) => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)); });
  let browser;
  try {
    browser = await chromium.launch({ headless: true }).catch((error) => {
      if (process.platform === 'win32') return chromium.launch({ headless: true, channel: 'msedge' });
      throw error;
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(15000);
    const user = { _id: 'qa', fullName: 'QA Demo', role: { name: 'User', permissions: ['project:read'] } };
    await page.addInitScript((user) => {
      localStorage.setItem('etms_token', 'mock-token');
      localStorage.setItem('etms-react-auth', JSON.stringify({ state: { token: 'mock-token', user }, version: 0 }));
    }, user);
    let moves = 0;
    let rejectMove = false;
    const items = [1, 2].map((n) => ({ _id: `item${n}`, cycle: 'c1', status: n === 1 ? 'Todo' : 'InProgress', reviewState: 'Approved', testCase: { _id: `tc${n}`, title: `Nộp bài OOP ${n}`, priority: 'High', testSteps: [] } }));
    await page.route('**/api/v1/**', async (route) => {
      const url = new URL(route.request().url());
      const endpoint = url.pathname.replace('/api/v1', '');
      let data = [];
      if (endpoint === '/auth/me') data = user;
      else if (endpoint === '/projects') data = [{ _id: 'p1', name: 'CTU e-Learning', key: 'CTU', currentRole: 'Owner' }];
      else if (endpoint === '/workspaces') data = [{ _id: 'w1', name: 'QA', currentRole: 'Owner' }];
      else if (endpoint === '/cycles') data = [{ _id: 'c1', name: 'Sprint 1 · OOP', status: 'Active' }];
      else if (/\/board-items\/.*\/move/.test(endpoint)) {
        moves++;
        if (rejectMove) return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Kiểm tra hoàn tác' }) });
        const item = items.find((item) => endpoint.includes(item._id));
        Object.assign(item, route.request().postDataJSON());
        data = item;
      } else if (endpoint === '/board-items') data = { items, columns: Object.fromEntries(['Backlog', 'Todo', 'InProgress', 'InReview', 'Done'].map((s) => [s, items.filter((i) => i.status === s)])) };
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
    });
    const origin = `http://127.0.0.1:${server.address().port}`;
    await page.goto(`${origin}/studio/board?project=p1&cycle=c1`);
    await page.locator('[data-card="item1"]').waitFor();
    assert.equal(await page.locator('nav').count(), 0, 'Board must be separate from sidebar layout');
    assert.equal(await page.locator('body').evaluate((el) => el.scrollHeight <= innerHeight), true, 'Board fits viewport vertically');
    const handle = () => page.getByRole('button', { name: 'Kéo thẻ Nộp bài OOP 1', exact: true });
    const column = (status) => page.locator(`[data-column="${status}"]`);
    await handle().dragTo(column('Done'));
    assert.equal(moves, 0, 'Invalid transitions must not send a move request');
    await handle().dragTo(column('InProgress').locator('[data-card="item2"]'));
    await column('InProgress').locator('[data-card="item1"]').waitFor();
    await page.locator('main[aria-busy="false"]').waitFor();
    assert.equal(items[0].status, 'InProgress');
    await handle().dragTo(column('InReview'));
    await column('InReview').locator('[data-card="item1"]').waitFor();
    await page.locator('main[aria-busy="false"]').waitFor();
    assert.equal(items[0].status, 'InReview');
    rejectMove = true;
    await handle().dragTo(column('InProgress'));
    await page.getByText('Kiểm tra hoàn tác', { exact: true }).waitFor();
    await column('InReview').locator('[data-card="item1"]').waitFor();
    assert.equal(moves, 3);
    assert.equal(items[0].status, 'InReview');
    await page.goto(`${origin}/studio/cycles?tab=board&project=p1&cycle=c1`);
    await page.locator('[data-card="item1"]').waitFor();
    assert.ok(page.url().includes('/studio/board?'));
    assert.ok(page.url().includes('cycle=c1'));
    if (process.env.BOARD_QA_SCREENSHOT) await page.screenshot({ path: process.env.BOARD_QA_SCREENSHOT, fullPage: true });
    console.log('PASS: standalone full-width Board; native drag onto populated and empty columns; invalid transitions blocked; rejected move rolls back; legacy links preserve Project and Cycle.');
  } finally { if (browser) await browser.close(); server.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
