// Browser checks use synthetic in-memory APIs; they never contact Atlas or AI.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
process.chdir(root);
const harness = `
import React from 'react';
import '/src/styles.css';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { executionApi, automationLabApi, workspaceApi, testCaseApi, bugApi } from '/src/api/client.js';
import TestRunExecutionPanel from '/src/features/e2e/TestRunExecutionPanel.jsx';
import SettingsPage from '/src/features/settings/SettingsPage.jsx';
import { useAuthStore } from '/src/store/authStore.js';
import ResultsTriagePage from '/src/features/e2e/ResultsTriagePage.jsx';
import AutomationLabPage from '/src/features/automation/AutomationLabPage.jsx';
import { TestPlanningDocumentEditor } from '/src/features/e2e/QAWorkflow.jsx';
const e = React.createElement;
const read = (key, fallback) => JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
let plans = read('audit-plans', []);
let execution = read('audit-execution', { _id: 'execution', testCase: { _id: 'case', title: 'Synthetic login', testSteps: [{ stepNumber: 1, action: 'Previously checked', expectedResult: 'Confirmed' }, { stepNumber: 2, action: 'Untested step', expectedResult: 'Must be checked' }] }, stepResults: [{ stepNumber: 1, status: 'Passed', actualResult: 'Confirmed previously' }], result: 'Passed', qaVerdict: 'Passed', actualResult: 'Saved QA note', runtimeUrl: 'https://example.test/' });
const settings = location.search.includes('settings');
if (settings) useAuthStore.setState({user:{_id:'owner'}});
const auto = location.search.includes('automation');
const triage = location.search.includes('triage');
if (triage && !localStorage.getItem('audit-triage-initialized')) { execution = { ...execution, result:'Failed', qaVerdict:null, qaReviewedAt:null, actualResult:'Observed failure', duration:0, triage:null }; localStorage.setItem('audit-triage-initialized','true'); localStorage.setItem('audit-execution',JSON.stringify(execution)); }
if (auto) execution = { ...execution, executionMode: 'Automation', environmentId: 'environment', result: 'NotRun', automationRun: null };
executionApi.run = async () => ({ run: { _id: 'run', executionMode: auto ? 'Automation' : 'Manual', testPlan: { kind: 'ExecutionPlan', approvalStatus: 'Approved' } }, scripts: auto ? [{ _id: 'script', testCase: 'case', engine: 'Playwright', filename: 'fixture.spec.js' }] : [], automationJobs: [], executions: [{...execution}] });
executionApi.automationPreflight = async () => ({ ready: localStorage.getItem('audit-auto-ready') === 'true', checks: [{ name: 'Script', ready: localStorage.getItem('audit-auto-ready') === 'true', detail: 'QA approval required' }], history: execution.automationRun ? [execution.automationRun] : [] });
executionApi.executeScript = async () => { execution = { ...execution, automationRun: { _id: 'runner', engine: 'Playwright', status: 'Running', attempt: 1 } }; localStorage.setItem('audit-auto-started', 'true'); return execution.automationRun; };
executionApi.recordExecution = async (_id, body) => { execution = { ...execution, ...body, qaVerdict:body.result, qaReviewedAt:new Date().toISOString(), qaAutomationRun:execution.automationRun?._id || null }; localStorage.setItem('audit-execution', JSON.stringify(execution)); return { execution }; };
executionApi.runs = async () => [{_id:'run',name:'Synthetic run',executionMode:'Manual'}];
executionApi.reviewTriage = async (_id, body) => { execution = {...execution, triage:{...body,reviewedAt:new Date().toISOString()}}; localStorage.setItem('audit-execution',JSON.stringify(execution)); return execution.triage; };
executionApi.analyzeExecution = async () => { localStorage.setItem('audit-ai-requested','true'); throw new Error('AI unavailable; manual triage remains available'); };
executionApi.bugDraft = async () => ({title:'[Environment] Synthetic login',description:execution.actualResult,actualResult:execution.actualResult,stepsToReproduce:'1. Open login',expectedResult:'Login form visible',environment:'https://authoritative.test/',severity:'Major',priority:'Medium',anomalyType:'Environment',attachments:[{fileName:'runner.log',fileUrl:'/api/v1/execution-artifacts/fixture/runner.log'}]});
bugApi.create = async (body) => { localStorage.setItem('audit-bug',JSON.stringify(body)); return {_id:'bug'}; };
executionApi.startManualBrowser = async () => { localStorage.setItem('audit-browser-starts', String(Number(localStorage.getItem('audit-browser-starts') || 0) + 1)); return { status: 'Ready' }; };
executionApi.endManualBrowser = async () => ({ status: 'Ended' });
executionApi.manualBrowserInput = async () => ({});
  executionApi.manualBrowserTicket = async () => { throw new Error('Fixture uses HTTP controls'); };
executionApi.captureManualBrowser = async () => { localStorage.setItem('audit-browser-capture', 'saved'); return { url: '/fixture.png' }; };
const actualFetch = window.fetch.bind(window);
window.fetch = async (url, options) => {
 if (String(url).includes('/automation-runs/') && String(url).includes('/live?')) { localStorage.setItem('audit-live-connections', String(Number(localStorage.getItem('audit-live-connections') || 0) + 1)); return new Response('event: state\\ndata: '+JSON.stringify({status:'Passed',percent:100,attempt:1,progress:{activity:'Hoàn tất: Passed',events:[],assertions:[{number:1,status:'Passed',duration:25}]}})+'\\n\\nevent: frame\\ndata: '+JSON.stringify({data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='})+'\\n\\n', {headers:{'Content-Type':'text/event-stream'}}); }
 if (String(url).includes('/automation-live')) {
  execution = {...execution, automationRun: {...execution.automationRun, status:'Passed'}};
  return new Response('event: state\\ndata: '+JSON.stringify({status:'Passed',attempt:1,progress:{activity:'Hoàn tất: Passed',events:[],assertions:[{number:1,status:'Passed',duration:25}]}})+'\\n\\n', { headers: {'Content-Type':'text/event-stream'} });
 }
 if (!String(url).includes('/manual-browser/stream')) return actualFetch(url, options);
 const body = new ReadableStream({ start(controller) {
  controller.enqueue(new TextEncoder().encode('event: state\\ndata: '+JSON.stringify({tabs:[],url:'https://example.test/',width:1440,height:900})+'\\n\\n'));
  options.signal.addEventListener('abort', () => controller.close(), { once: true });
 } });
 return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
};
automationLabApi.datasets = async () => [];
automationLabApi.fixtures = async () => [];
workspaceApi.projects = async () => [{_id:'project',name:'Synthetic project',currentRole:'Owner'}];
let integration = read('audit-jira-connection', {_id:'jira-connection',provider:'Jira',displayName:'Synthetic Jira',project:{_id:'project',key:'QA'},workspace:'workspace',externalProjectKey:'QA',status:'Connected',hasCredentials:true,settings:{accountEmail:'owner@example.test'},syncConfig:{direction:'Outbound',entities:['Bug']}});
workspaceApi.workspaces = async () => [{_id:'workspace',name:'Synthetic workspace',owner:'owner'}];
workspaceApi.workspaceMemberships = async () => [];
workspaceApi.integrations = async () => settings ? [integration] : [];
workspaceApi.updateIntegration = async (_id, body) => { integration={...integration,...body}; localStorage.setItem('audit-jira-connection',JSON.stringify(integration)); localStorage.setItem('audit-jira-request',JSON.stringify(body)); return integration; };
automationLabApi.dockerStatus = async () => ({available:true});
automationLabApi.environments = async () => [{_id:'environment',name:'Synthetic environment',status:'Ready',targetUrl:'https://example.test/'}];
testCaseApi.list = async () => [{_id:'case',title:'Synthetic login',status:'Approved'}];
automationLabApi.scripts = async () => [{_id:'script',testCase:{_id:'case',title:'Synthetic login'},engine:'Playwright',status:'Approved',filename:'fixture.spec.js',code:'approved fixture script'}];
automationLabApi.createRun = async () => ({_id:'standalone-job'});
automationLabApi.run = async (id) => ({_id:id,status:'Passed',progress:100,attempt:1,engine:'Playwright'});
executionApi.createPlan = async (body) => { const plan = { ...body, _id: 'plan-' + plans.length }; plans.push(plan); localStorage.setItem('audit-plans', JSON.stringify(plans)); return plan; };
executionApi.updatePlan = async (id, body) => { const plan = { ...body, _id: id }; plans = plans.map((item) => item._id === id ? plan : item); localStorage.setItem('audit-plans', JSON.stringify(plans)); return plan; };
function App() {
 const items = useQuery({ queryKey: ['e2e-plans'], queryFn: async () => [...plans] });
 if (settings) return e(SettingsPage);
 if (triage) return e(ResultsTriagePage);
 if (location.search.includes('lab')) return e(AutomationLabPage);
 if (location.search.includes('notes') || auto) return e(TestRunExecutionPanel, { runId: 'run', project: 'project', profile: 'profile' });
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
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ contentType: 'text/css', body: '' }));
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
  assert.equal(await page.getByLabel('Kết quả bước 1', { exact: true }).inputValue(), 'Passed');
  assert.equal(await page.getByLabel('Kết quả bước 2', { exact: true }).inputValue(), 'NotRun');
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

  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.getByRole('button', { name: 'Bắt đầu Manual Test', exact: true }).click();
  const workspace = page.getByRole('dialog', { name: 'Không gian thực thi Manual', exact: true });
  await workspace.getByText('● Đã kết nối', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('audit-browser-starts')), '1');
  await note.fill('Manual workspace QA note');
  await page.getByRole('button', { name: 'Lưu kết quả QA' }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('audit-execution')).actualResult === 'Manual workspace QA note');
  assert.equal(await page.evaluate(() => localStorage.getItem('audit-browser-starts')), '1', 'saving QA results must not restart the browser');
  await page.getByRole('button', { name: 'Chụp evidence', exact: true }).click();
  await page.waitForFunction(() => localStorage.getItem('audit-browser-capture') === 'saved');
  const width = await page.getByLabel('Màn hình website kiểm thử tương tác').evaluate((element) => element.getBoundingClientRect().width);
  assert.ok(width > 600, 'remote browser should have usable space beside QA controls');
  await page.getByRole('button', { name: 'Kết thúc & quay lại Test Run', exact: true }).click();
  assert.equal(await note.inputValue(), 'Manual workspace QA note');
  assert.equal(await page.getByRole('dialog', { name: 'Không gian thực thi Manual', exact: true }).count(), 0);
  console.log('PASS: split Manual workspace, evidence capture, result saving without browser restart, and return to Test Run.');

  await page.goto(`${base}?automation`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const runButton = page.getByRole('button', { name: 'Chạy script đã duyệt', exact: true });
  await page.getByLabel('Automation readiness').waitFor();
  assert.equal(await runButton.isEnabled(), false, 'unready Automation must not start');
  await page.evaluate(() => localStorage.setItem('audit-auto-ready', 'true'));
  await page.getByRole('button', { name: 'Kiểm tra lại', exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent === 'Chạy script đã duyệt' && !button.disabled));
  await runButton.click();
  const monitor = page.getByRole('region', { name: 'Theo dõi Automation chỉ xem' });
  await monitor.waitFor();
  await monitor.getByText('#1 · Passed · 25 ms', { exact: true }).waitFor();
  assert.equal(await monitor.locator('canvas').count(), 0, 'Automation must not expose Manual input controls');
  await page.getByRole('button', { name: 'Quay lại Test Run', exact: true }).click();
  assert.equal(await page.getByRole('dialog', { name: 'Không gian thực thi Automation', exact: true }).count(), 0);
  console.log('PASS: Automation readiness blocks execution, ready scripts open the read-only runner workspace, and assertions are visible.');

  await page.goto(`${base}?lab&project=project`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByRole('button', { name: 'Synthetic login · Playwright', exact: false }).click();
  await page.locator('select').filter({ has: page.locator('option', { hasText: 'Chọn Environment Ready' }) }).selectOption('environment');
  await page.getByRole('button', { name: 'Chạy Playwright', exact: true }).click();
  const labMonitor = page.getByRole('region', { name: 'Theo dõi Automation chỉ xem' });
  await labMonitor.getByText('#1 · Passed · 25 ms', { exact: true }).waitFor();
  await labMonitor.getByText('Tiến trình job: 100% · theo giai đoạn thực thi', { exact: true }).waitFor();
  assert.equal(await labMonitor.getByRole('img').count(), 1);
  await labMonitor.getByRole('img').evaluate((image) => image.decode());
  const liveConnections = await page.evaluate(() => localStorage.getItem('audit-live-connections'));
  const frameBox = labMonitor.getByLabel('Khung hình trình duyệt Automation', { exact: true });
  const originalHeight = (await frameBox.boundingBox()).height;
  await labMonitor.getByLabel('Chiều cao trình duyệt Automation').focus();
  await page.keyboard.press('End');
  assert.ok((await frameBox.boundingBox()).height > originalHeight, 'QA can enlarge the browser without cropping its image');
  await labMonitor.getByRole('button', { name: 'Toàn màn hình', exact: true }).click();
  const expanded = page.getByRole('dialog', { name: 'Màn hình Automation mở rộng', exact: true });
  await expanded.waitFor();
  const bounds = await expanded.boundingBox();
  assert.equal(Math.round(bounds.width), page.viewportSize().width);
  assert.equal(Math.round(bounds.height), page.viewportSize().height);
  assert.ok(await expanded.evaluate((element) => element.scrollWidth <= element.clientWidth), 'expanded viewer must not overflow horizontally');
  await page.keyboard.press('Escape');
  assert.equal(await expanded.count(), 0);
  assert.equal(await page.evaluate(() => localStorage.getItem('audit-live-connections')), liveConnections, 'expanding/collapsing must preserve the stream instead of reconnecting or rerunning');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await labMonitor.evaluate((element) => element.scrollWidth <= element.clientWidth), 'narrow viewer must not overflow horizontally');
  await page.setViewportSize({ width: 1280, height: 720 });
  assert.ok(page.url().includes('job=standalone-job'));
  await page.reload();
  await page.getByRole('region', { name: 'Theo dõi Automation chỉ xem' }).getByText('#1 · Passed · 25 ms', { exact: true }).waitFor();
  console.log('PASS: Automation Lab opens the live viewer, displays completed progress as 100%, and reopens the job after refresh.');

  await page.goto(`${base}?triage&project=project&run=run`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByRole('heading', {name:'Results & Triage', exact:true}).waitFor();
  await page.getByText('Chờ xác nhận QA', {exact:true}).waitFor();
  assert.equal(await page.getByRole('link', {name:'Đánh giá hoàn tất & báo cáo'}).count(),0);
  assert.equal(await page.getByRole('button', {name:'Ghi Bug Log',exact:true}).isEnabled(),false);
  await page.getByRole('textbox', {name:'Ghi chú kết quả'}).fill('Confirmed failure with evidence');
  await page.getByLabel('Thời gian thực hiện (phút)').fill('1.25');
  await page.getByRole('button', {name:'Lưu kết quả QA',exact:true}).click();
  await page.getByText('QA: Failed', {exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('audit-execution')).duration),1.25);
  await page.getByRole('button', {name:'AI gợi ý root cause',exact:true}).click();
  await page.waitForFunction(()=>localStorage.getItem('audit-ai-requested')==='true');
  await page.getByLabel('Phân loại triage').selectOption('Environment');
  await page.getByLabel('Root cause QA').fill('Staging service unavailable');
  await page.getByLabel('Giải pháp QA').fill('Restore staging then retest');
  await page.getByRole('button', {name:'Xác nhận triage',exact:true}).click();
  await page.getByRole('link', {name:'Đánh giá hoàn tất & báo cáo'}).waitFor();
  await page.reload();
  await page.getByLabel('Root cause QA').waitFor();
  assert.equal(await page.getByLabel('Root cause QA').inputValue(),'Staging service unavailable');
  assert.equal(await page.getByRole('textbox',{name:'Ghi chú kết quả'}).inputValue(),'Confirmed failure with evidence');
  await page.getByRole('button', {name:'Ghi Bug Log',exact:true}).click();
  assert.equal(await page.getByLabel('Các bước tái hiện').inputValue(),'1. Open login');
  assert.equal(await page.getByLabel('Kết quả mong đợi').inputValue(),'Login form visible');
  assert.equal(await page.getByLabel('Kết quả thực tế',{exact:true}).inputValue(),'Confirmed failure with evidence');
  await page.getByRole('button', {name:'Lưu Bug Log',exact:true}).click();
  await page.waitForFunction(()=>localStorage.getItem('audit-bug'));
  const bug = await page.evaluate(()=>JSON.parse(localStorage.getItem('audit-bug')));
  assert.equal(bug.approvalStatus,'PendingApproval');
  assert.equal(bug.environment,'https://authoritative.test/');
  assert.equal(bug.attachments[0].fileName,'runner.log');
  console.log('PASS: Results & Triage requires QA, persists notes/time/classification, works without AI, and prefills pending Bug evidence.');

  await page.goto(`${base}?settings`, {waitUntil:'domcontentloaded',timeout:60000});
  await page.getByRole('button',{name:'Ánh xạ trạng thái',exact:true}).click();
  const mapping = page.getByRole('dialog',{name:'Ánh xạ trạng thái Jira',exact:true});
  await mapping.getByLabel('Jira cho InProgress',{exact:true}).fill('In Progress');
  await mapping.getByLabel('Jira cho New',{exact:true}).fill('To Do');
  await mapping.getByRole('button',{name:'Lưu ánh xạ',exact:true}).click();
  await page.waitForFunction(()=>localStorage.getItem('audit-jira-request'));
  const mappingRequest=await page.evaluate(()=>JSON.parse(localStorage.getItem('audit-jira-request')));
  assert.deepEqual(Object.keys(mappingRequest),['syncConfig']);
  assert.equal(mappingRequest.syncConfig.direction,'Outbound');
  assert.equal(mappingRequest.syncConfig.statusMappings.InProgress,'In Progress');
  await page.reload();
  await page.getByRole('button',{name:'Ánh xạ trạng thái',exact:true}).click();
  assert.equal(await page.getByLabel('Jira cho InProgress',{exact:true}).inputValue(),'In Progress');
  await page.getByRole('dialog',{name:'Ánh xạ trạng thái Jira',exact:true}).getByRole('button',{name:'Hủy',exact:true}).click();
  console.log('PASS: Jira mappings save and reopen per connection without resending credentials or changing other sync configuration.');

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
