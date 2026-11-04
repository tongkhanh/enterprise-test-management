// Isolated browser test: all API traffic uses in-memory fixtures, never a live project or AI provider.
const express = require('express');
const { chromium } = require('playwright');
const path = require('node:path');
const assert = require('node:assert/strict');
const { summarize } = require('../services/cyclePlanningService');
async function main() {
  const app = express();
  app.use('/studio', express.static(path.resolve(__dirname, '../public/studio')));
  app.use((_req, res) => res.sendFile(path.resolve(__dirname, '../public/studio/index.html')));
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  let browser;
  try {
    browser = await chromium.launch({ headless: true }).catch((error) => { if (process.platform === 'win32') return chromium.launch({ headless: true, channel: 'msedge' }); throw error; });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1050 } });
    page.on('pageerror', (error) => console.error('UI error:', error.message));
    page.setDefaultTimeout(15000);
    const user = { _id: 'u1', fullName: 'QA Demo', role: { name: 'User', permissions: ['project:read'] } };
    await page.addInitScript((user) => { localStorage.setItem('etms_token', 'fixture'); localStorage.setItem('etms-react-auth', JSON.stringify({ state: { token: 'fixture', user }, version: 0 })); }, user);
    const cycle = { _id: 'c1', name: 'Sprint 1 · Nộp bài OOP', status: 'Planning', startDate: '2026-10-28', endDate: '2026-11-04', planningCapacityMinutes: 30, planningMaxCases: 3 };
    const items = [
      { _id: 'a', cycle: null, status: 'Backlog', testCase: { _id: 'tcA', testCaseId: 'TC-01', title: 'Phân quyền bài nộp', priority: 'Critical', estimatedTime: 10, status: 'Approved' } },
      { _id: 'b', cycle: null, status: 'Backlog', testCase: { _id: 'tcB', testCaseId: 'TC-02', title: 'Dữ liệu không hợp lệ', priority: 'High', estimatedTime: 8, status: 'Approved' } },
      { _id: 'c', cycle: { _id: 'c2', name: 'Sprint khác' }, status: 'Todo', testCase: { _id: 'tcC', title: 'Case ở Cycle khác', estimatedTime: 5, status: 'Approved' } },
      { _id: 'd', cycle: null, status: 'Backlog', testCase: { _id: 'tcD', title: 'Case chưa ước tính', estimatedTime: 0, status: 'Approved' } },
      { _id: 'e', cycle, status: 'Done', testCase: { _id: 'tcE', title: 'Case đã hoàn thành', estimatedTime: 4, status: 'Approved' } },
    ].map((item) => ({ ...item, reviewState: 'Approved' }));
    const inCycle = () => items.filter((item) => item.cycle?._id === 'c1');
    const cycleData = () => ({ ...cycle, plannedCases: inCycle(), planningSummary: summarize(inCycle()) });
    let applies = 0;
    await page.route('**/api/v1/**', async (route) => {
      const url = new URL(route.request().url()); const endpoint = url.pathname.replace('/api/v1', ''); const method = route.request().method();
      let data = [];
      if (endpoint === '/auth/me') data = user;
      else if (endpoint === '/projects') data = [{ _id: 'p1', name: 'CTU e-Learning', key: 'CTU', currentRole: 'Owner' }];
      else if (endpoint === '/workspaces') data = [{ _id: 'w1', name: 'Demo', currentRole: 'Owner' }];
      else if (endpoint === '/test-plans') data = [{ _id: 'tp1', name: 'Test Plan OOP', kind: 'TestPlan', approvalStatus: 'Approved', scope: 'Nộp bài tập lớn trong khóa học OOP' }];
      else if (endpoint === '/cycles') data = [cycleData()];
      else if (endpoint === '/cycle-planning') data = { items, summary: summarize(items) };
      else if (endpoint === '/cycle-planning/suggest') {
        const body = route.request().postDataJSON(); assert.equal(body.testPlanId, 'tp1'); assert.equal(body.cycleId, 'c1'); assert.equal(body.capacityMinutes, 30); assert.equal(body.maxCases, 3);
        data = { recommendations: [{ boardItemId: 'a', reason: 'Ưu tiên phân quyền' }, { boardItemId: 'b', reason: 'Kiểm tra validation' }], generatedBy: 'AI', note: 'Đề xuất từ Test Plan hiện có.' };
      } else if (endpoint === '/cycle-planning/apply') {
        const body = route.request().postDataJSON(); assert.deepEqual(body.boardItemIds.sort(), ['a', 'b']); applies++;
        items.filter((item) => body.boardItemIds.includes(item._id)).forEach((item) => { item.cycle = cycle; item.status = 'Todo'; });
        data = { assignedCount: 2, cycleId: 'c1', summary: summarize(inCycle()) };
      } else if (/\/board-items\/.*\/move/.test(endpoint) && method === 'PATCH') {
        const item = items.find((item) => endpoint.includes(item._id)); const body = route.request().postDataJSON(); item.status = body.status; item.cycle = cycle; data = item;
      } else if (endpoint === '/board-items') { const shown = items.filter((item) => !item.cycle || item.cycle?._id === 'c1'); data = { items: shown, columns: Object.fromEntries(['Backlog', 'Todo', 'InProgress', 'InReview', 'Done'].map((s) => [s, shown.filter((i) => i.status === s)])) }; }
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
    });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const openPlanning = async () => {
      await page.goto(`${origin}/studio/cycles?tab=issues&project=p1`);
      await page.getByRole('heading', { name: 'Kế hoạch kiểm thử theo tuần', exact: true }).waitFor().catch(async (error) => { console.error((await page.locator('body').innerText()).slice(0, 3000)); throw error; });
      await page.getByLabel('Test Plan có sẵn', { exact: true }).selectOption('tp1');
      await page.getByLabel('Cycle / Sprint nhận việc', { exact: true }).selectOption('c1');
      await page.getByRole('checkbox', { name: 'Chọn Phân quyền bài nộp', exact: true }).waitFor();
    };
    await openPlanning();
    assert.equal(await page.getByRole('checkbox', { name: 'Chọn Case ở Cycle khác', exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole('checkbox', { name: 'Chọn Case chưa ước tính', exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Gemini đề xuất Test Plan', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Gemini đề xuất kế hoạch tuần', exact: true }).click();
    await page.getByText('Ưu tiên phân quyền', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Áp dụng 2 Test Case vào Todo', exact: true }).click();
    await page.getByText('Đã đưa 2 Test Case vào Todo của Cycle.', { exact: true }).waitFor();
    assert.equal(applies, 1);
    await page.getByText('Xem Test Case, người phụ trách và trạng thái', { exact: true }).click();
    const current = page.getByRole('heading', { name: `Đã xếp trong ${cycle.name}`, exact: true }).locator('..');
    await current.getByText('Todo:', { exact: false }).waitFor();
    assert.ok((await current.innerText()).includes('Phân quyền bài nộp'));
    await current.getByRole('link', { name: 'Mở Board của Cycle →', exact: true }).click();
    await page.locator('[data-column="Todo"] [data-card="a"]').waitFor();
    await page.locator('[data-card="a"]').getByRole('combobox', { name: 'Chuyển trạng thái', exact: true }).selectOption('InProgress');
    await page.locator('main[aria-busy="false"]').waitFor();
    await page.goto(`${origin}/studio/cycles?project=p1`);
    await page.getByText('Xem Test Case, người phụ trách và trạng thái', { exact: true }).click();
    assert.ok((await page.locator('main').innerText()).includes('In Progress: 1'));
    assert.ok((await page.locator('main').innerText()).includes('Phân quyền bài nộp'));
    await openPlanning();
    await page.getByText('Xem Test Case, người phụ trách và trạng thái', { exact: true }).click();
    assert.equal(await page.getByRole('checkbox', { name: 'Chọn Phân quyền bài nộp', exact: true }).isDisabled(), true);
    if (process.env.PLANNING_QA_SCREENSHOT) await page.screenshot({ path: process.env.PLANNING_QA_SCREENSHOT, fullPage: true });
    console.log('PASS: existing Test Plan → weekly AI proposal → apply only selected cases → Cycle summary → Board status change → synchronized Cycle and weekly views; already assigned and unestimated cases blocked.');
  } finally { if (browser) await browser.close(); server.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
