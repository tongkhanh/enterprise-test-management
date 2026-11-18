// Browser checks use synthetic in-memory APIs; they never contact Atlas or AI.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const harness = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { executionApi, automationLabApi } from '/src/api/client.js';
import TestRunExecutionPanel from '/src/features/e2e/TestRunExecutionPanel.jsx';
import { TestPlanningDocumentEditor } from '/src/features/e2e/QAWorkflow.jsx';
const e = React.createElement;
const read = (key, fallback) => JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
let plans = read('audit-plans', []);
let execution = read('audit-execution', { _id: 'execution', testCase: { _id: 'case', title: 'Synthetic login' }, result: 'Passed', qaVerdict: 'Passed', actualResult: 'Saved QA note', runtimeUrl: 'https://example.test/' });
executionApi.run = async () => ({ run: { _id: 'run', testPlan: { kind: 'ExecutionPlan', approvalStatus: 'Approved' } }, scripts: [], automationJobs: [], executions: [execution] });
executionApi.recordExecution = async (_id, body) => { execution = { ...execution, ...body }; localStorage.setItem('audit-execution', JSON.stringify(execution)); return { execution }; };
automationLabApi.datasets = async () => [];
automationLabApi.fixtures = async () => [];
executionApi.createPlan = async (body) => { const plan = { ...body, _id: 'plan-' + plans.length }; plans.push(plan); localStorage.setItem('audit-plans', JSON.stringify(plans)); return plan; };
executionApi.updatePlan = async (id, body) => { const plan = { ...body, _id: id }; plans = plans.map((item) => item._id === id ? plan : item); localStorage.setItem('audit-plans', JSON.stringify(plans)); return plan; };
function App() {
 const items = useQuery({ queryKey: ['e2e-plans'], queryFn: async () => [...plans] });
 if (location.search.includes('notes')) return e(TestRunExecutionPanel, { runId: 'run', project: 'project', profile: 'profile' });
 return e(TestPlanningDocumentEditor, { activeProject: 'project', profile: { _id: 'profile', workflow: { testBasisSelection: { requirements: [], useCases: [], userStories: ['story'] } } }, stories: [{ _id: 'story', title: 'Approved synthetic story', approvalStatus: 'Approved', source: 'ImportedDocument' }], items: items.data || [], onNext: () => {}, setActiveStep: () => {} });
}
createRoot(document.getElementById('root')).render(e(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }, e(BrowserRouter, null, e(App))));
`;
const server = await createServer({
  root, configFile: path.join(root, 'vite.config.js'), server: { host: '127.0.0.1', port: 0, strictPort: false },
  plugins: [{
    name: 'isolated-workflow-retest', enforce: 'pre',
    resolveId(id) { if (id === 'virtual:workflow-retest') return '\0virtual:workflow-retest'; },
    load(id) { if (id === '\0virtual:workflow-retest') return harness; },
    transform(code, id) { if (id.endsWith('/QAWorkflow.jsx')) return `${code}\nexport { TestPlanningDocumentEditor };`; },
    configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/studio/__workflow-retest')) return next();
        res.setHeader('Content-Type', 'text/html');
        res.end('<div id="root"></div><script type="module">import RefreshRuntime from "/studio/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/studio/@vite/client"></script><script type="module" src="/studio/@id/__x00__virtual:workflow-retest"></script>');
      });
    },
  }],
});
let browser;
try {
  await server.listen();
  const base = `http://127.0.0.1:${server.httpServer.address().port}/studio/__workflow-retest`;
  browser = await chromium.launch({ headless: true }).catch((error) => {
    if (process.platform === 'win32' && /Executable doesn't exist/.test(error.message)) return chromium.launch({ headless: true, channel: 'msedge' });
    throw error;
  });
  const page = await browser.newPage();
  // The first Vite transform compiles the large QA workflow on demand. A cold
  // GitHub runner can legitimately take longer than 15 seconds even though the
  // page is healthy, so keep assertion waits bounded but give initial
  // navigation enough time to finish the cold compilation.
  page.setDefaultTimeout(30000);
  page.on('pageerror', (error) => console.error(error.message));
  page.on('console', (message) => { if (message.type() === 'error') console.error(message.text()); });
  await page.route('**/api/v1/**', (route) => { throw new Error(`Unexpected real API request: ${route.request().url()}`); });
  await page.goto(`${base}?notes`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const note = page.getByRole('textbox', { name: 'Ghi chú kết quả' });
  await note.waitFor();
  assert.equal(await note.inputValue(), 'Saved QA note');
  await note.fill('Updated QA note');
  await page.getByRole('button', { name: 'Lưu kết quả QA' }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('audit-execution')).actualResult === 'Updated QA note');
  await page.reload();
  await note.waitFor();
  assert.equal(await note.inputValue(), 'Updated QA note');
  await note.fill('');
  await page.getByRole('button', { name: 'Lưu kết quả QA' }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('audit-execution')).actualResult === '');
  await page.reload();
  await note.waitFor();
  assert.equal(await note.inputValue(), '');
  console.log('PASS: saved QA notes reload, can be edited without changing verdict, and can be cleared.');

  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByRole('tab', { name: 'Tự soạn / chỉnh sửa', exact: true }).click();
  await page.getByRole('dialog', { name: 'Soạn Test Plan' }).getByLabel('Tên Test Plan *').fill('Synthetic Feature draft');
  await page.getByRole('dialog', { name: 'Soạn Test Plan' }).getByRole('button', { name: 'Lưu Draft', exact: true }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('audit-plans') || '[]').length === 1);
  await page.reload();
  await page.locator('summary').filter({ hasText: 'Synthetic Feature draft' }).click();
  await page.getByRole('button', { name: 'Chỉnh sửa', exact: true }).click();
  const title = page.getByRole('dialog', { name: 'Chỉnh sửa Test Plan' }).getByLabel('Tên Test Plan *');
  assert.equal(await title.inputValue(), 'Synthetic Feature draft');
  await title.fill('Updated Feature draft');
  await page.getByRole('dialog', { name: 'Chỉnh sửa Test Plan' }).getByRole('button', { name: 'Lưu Draft', exact: true }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('audit-plans'))[0].name === 'Updated Feature draft');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('audit-plans')).length), 1);
  console.log('PASS: draft saves, reloads, reopens for editing, and updates without duplicates.');
} finally {
  await browser?.close();
  await server.close();
}
