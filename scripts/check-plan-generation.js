const express = require('express');
const { chromium } = require('playwright');
const path = require('node:path');
const assert = require('node:assert/strict');
async function main() {
  const app = express();
  app.use('/studio', express.static(path.resolve(__dirname, '../public/studio')));
  app.use((_req, res) => res.sendFile(path.resolve(__dirname, '../public/studio/index.html')));
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  let browser;
  try {
    browser = await chromium.launch({ headless: true }).catch((error) => { if (process.platform === 'win32') return chromium.launch({ headless: true, channel: 'msedge' }); throw error; });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } }); page.setDefaultTimeout(15000);
    page.on('pageerror', (error) => console.error('UI error:', error.message));
    const user = { _id: 'u1', fullName: 'QA Demo', role: { name: 'User', permissions: ['project:read'] } };
    await page.addInitScript((user) => { localStorage.setItem('etms_token', 'fixture'); localStorage.setItem('etms-react-auth', JSON.stringify({ state: { token: 'fixture', user }, version: 0 })); }, user);
    let mode = 'error'; let release;
    const result = { success: true, data: { suggestion: { name: 'Kế hoạch AI đã tạo', scope: 'Kiểm thử nộp bài', objectives: ['Nộp bài thành công'], risks: [], testItems: [], outOfScope: [], entryCriteria: [], exitCriteria: [], deliverables: [] }, fallback: false } };
    await page.route('**/api/v1/**', async (route) => {
      const endpoint = new URL(route.request().url()).pathname.replace('/api/v1', ''); let data = [];
      if (endpoint === '/auth/me') data = user;
      else if (endpoint === '/projects') data = [{ _id: 'p1', name: 'CTU', key: 'CTU', currentRole: 'Owner' }];
      else if (endpoint === '/workspaces') data = [{ _id: 'w1', name: 'Demo', currentRole: 'Owner' }];
      else if (endpoint.includes('system-profiles')) data = [{ _id: 'profile1', project: 'p1', name: 'CTU', mode: 'SystemProfile', status: 'Ready' }];
      else if (endpoint === '/user-stories') data = [{ _id: 'story1', title: 'Nộp bài OOP', approvalStatus: 'Approved', e2e: { systemProfile: 'profile1' }, acceptanceCriteria: [] }];
      else if (endpoint === '/test-plans/suggest-from-requirements') {
        if (mode === 'error') return route.fulfill({ status: 504, contentType: 'application/json', body: JSON.stringify({ error: 'Gemini phản hồi quá lâu.' }) });
        if (mode === 'slow') return new Promise((resolve) => { release = async () => { await route.fulfill({ contentType: 'application/json', body: JSON.stringify(result) }).catch(() => {}); resolve(); }; });
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(result) });
      }
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/studio/ai-generator?step=plan&project=p1&profile=profile1`);
    const aiButton = () => page.getByRole('button', { name: /Tạo nhanh từ User Story/ });
    const manual = () => page.getByRole('button', { name: /Tự soạn Test Plan/ });
    await aiButton().click();
    await page.getByRole('alert').getByText('Gemini phản hồi quá lâu.', { exact: true }).waitFor();
    assert.equal(await aiButton().isEnabled(), true);
    await manual().click();
    await page.getByPlaceholder('Feature Test Plan · Nộp bài tập lớn', { exact: true }).fill('Bản nhập tay cần giữ');
    mode = 'slow';
    await aiButton().click();
    await page.getByRole('button', { name: 'Hủy tạo AI', exact: true }).waitFor();
    await manual().click();
    await page.getByPlaceholder('Feature Test Plan · Nộp bài tập lớn', { exact: true }).waitFor();
    if (release) await release();
    assert.equal(await page.getByPlaceholder('Feature Test Plan · Nộp bài tập lớn', { exact: true }).inputValue(), 'Bản nhập tay cần giữ');
    mode = 'success';
    await aiButton().click();
    await page.getByText('Kế hoạch AI đã tạo', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Hủy tạo AI', exact: true }).count(), 0);
    console.log('PASS: inline AI error and retry; pending request can be canceled; late response cannot overwrite manual input; successful retry opens the generated preview.');
  } finally { if (browser) await browser.close(); server.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
