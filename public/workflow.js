const API_ROOT = '/api/v1';
const finalStatuses = new Set(['Passed', 'Failed', 'Error', 'Cancelled']);
const titles = { context: 'Tạo phiên kiểm thử', discover: 'Web Analyzer', design: 'Thiết kế Test Case', review: 'Phê duyệt', execute: 'Test Run', diagnose: 'Root Cause Analyzer', triage: 'Xác nhận kết quả' };
const state = { user: null, projects: [], project: null, stories: [], suites: [], members: [], analysis: null, cases: [], selectedCase: null, reviews: [], myReviews: [], preparedRun: null, jobs: [], job: null, rootCause: null, jiraStatus: null, reroute: null, pollTimer: null, screenshotObjectUrl: null, evidenceObjectUrl: null };
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const token = () => localStorage.getItem('etms_token') || '';
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const idOf = (value) => String(value?._id || value || '');
const formatDate = (value) => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—';
const roleLabel = (name) => ({ QA_Lead: 'QA Lead', Admin: 'Admin', Tester: 'Tester', PM: 'Project Manager', Developer: 'Developer', Guest: 'Guest' }[name] || name || 'User');

function toast(message, type = 'success') {
  const item = document.createElement('div'); item.className = `toast ${type}`; item.textContent = message;
  $('#toastHost').append(item); setTimeout(() => item.remove(), 4200);
}
function loading(show, title = 'Đang xử lý…', text = 'Vui lòng giữ trang này mở.') {
  $('#loadingTitle').textContent = title; $('#loadingText').textContent = text; $('#loadingOverlay').classList.toggle('hidden', !show);
}
async function api(path, options = {}) {
  const headers = { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(token() ? { Authorization: `Bearer ${token()}` } : {}), ...(options.headers || {}) };
  const response = await fetch(path.startsWith('/api/') ? path : `${API_ROOT}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({ success: false, error: `HTTP ${response.status}` }));
  if (!response.ok || data.success === false) {
    if (response.status === 401 && token()) logout(false);
    const error = new Error(data.error || data.message || 'Yêu cầu thất bại'); error.status = response.status; error.payload = data; throw error;
  }
  return data.data;
}
async function fetchProtectedBlob(url) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token()}` } });
  if (!response.ok) throw new Error(`Không tải được artifact (${response.status})`);
  return response.blob();
}
function parseJson(text, label = 'JSON') { try { return JSON.parse(text || '{}'); } catch { throw new Error(`${label} không đúng định dạng JSON.`); } }
function flattenSuites(items, depth = 0) { return (items || []).flatMap((item) => [{ ...item, depth }, ...flattenSuites(item.children, depth + 1)]); }
function setOptions(element, items, placeholder, label) {
  element.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>${items.map((item) => `<option value="${idOf(item)}">${'— '.repeat(item.depth || 0)}${escapeHtml(label(item))}</option>`).join('')}`;
}

function showAuth(view = 'login') {
  $('#authScreen').classList.remove('hidden'); $('#appShell').classList.add('hidden');
  $('#loginForm').classList.toggle('hidden', view !== 'login'); $('#registerForm').classList.toggle('hidden', view !== 'register');
}
function showApp() { $('#authScreen').classList.add('hidden'); $('#appShell').classList.remove('hidden'); }
function logout(notify = true) {
  if (state.pollTimer) clearTimeout(state.pollTimer); localStorage.removeItem('etms_token'); state.user = null; showAuth();
  if (notify) toast('Đã đăng xuất.');
}

async function initialize() {
  if (!token()) return showAuth();
  try {
    state.user = await api('/auth/me'); showApp(); renderUser(); await loadProjects();
    const savedProject = localStorage.getItem('etms_project');
    if (savedProject && state.projects.some((item) => idOf(item) === savedProject)) await selectProject(savedProject);
    else if (state.projects.length === 1) await selectProject(idOf(state.projects[0]));
    switchStage('context');
  } catch (error) { showAuth(); toast(error.message, 'error'); }
}
function renderUser() {
  const name = state.user.fullName || 'User'; $('#userName').textContent = name; $('#userRole').textContent = roleLabel(state.user.role?.name); $('#userAvatar').textContent = name.split(/\s+/).slice(-2).map((word) => word[0]).join('').toUpperCase();
}
async function loadProjects() {
  state.projects = await api('/projects?limit=100');
  const render = (select) => setOptions(select, state.projects, state.projects.length ? 'Chọn project' : 'Chưa có Project', (item) => `${item.key} · ${item.name}`);
  render($('#projectSelect')); render($('#sidebarProject'));
  if (!state.projects.length) toast('Workspace chưa có Project. Hãy tạo Project trong trang Quản trị hệ thống.', 'error');
}
async function selectProject(projectId) {
  if (!projectId) { state.project = null; return; }
  state.project = state.projects.find((item) => idOf(item) === projectId); localStorage.setItem('etms_project', projectId);
  $('#projectSelect').value = projectId; $('#sidebarProject').value = projectId;
  loading(true, 'Đang tải Project…', 'Đồng bộ User Story, Test Suite và thành viên.');
  try {
    const [stories, suites, members] = await Promise.all([api(`/user-stories?project=${projectId}&limit=100`), api(`/test-suites?project=${projectId}`), api(`/projects/${projectId}/members`)]);
    state.stories = stories; state.suites = flattenSuites(suites); state.members = members;
    setOptions($('#storySelect'), stories, stories.length ? 'Chọn User Story' : 'Project chưa có User Story', (item) => item.title);
    setOptions($('#suiteSelect'), state.suites, state.suites.length ? 'Chọn Test Suite' : 'Project chưa có Test Suite', (item) => item.name);
    $('#storySelect').disabled = !stories.length; $('#suiteSelect').disabled = !state.suites.length; renderReviewers(); resetWorkflow(false);
  } catch (error) { toast(error.message, 'error'); } finally { loading(false); }
}
function renderReviewers() {
  const reviewers = state.members.filter((member) => ['QA_Lead', 'Admin'].includes(member.role?.name));
  setOptions($('#reviewerSelect'), reviewers, reviewers.length ? 'Chọn QA Lead' : 'Project chưa có QA Lead', (item) => `${item.fullName} · ${roleLabel(item.role?.name)}`);
}
function resetWorkflow(clearInputs = true) {
  state.analysis = null; state.cases = []; state.selectedCase = null; state.preparedRun = null; state.jobs = []; state.job = null; state.rootCause = null; state.reroute = null;
  if (state.pollTimer) clearTimeout(state.pollTimer); state.pollTimer = null;
  if (clearInputs) { $('#storySelect').value = ''; $('#suiteSelect').value = ''; $('#targetUrl').value = ''; }
  renderStoryPreview(); renderAnalysis(); renderCases(); renderReviewForm(); renderRun(); renderRootCause(); renderTriage(); updateCounts();
}
function switchStage(name) {
  $$('.stage').forEach((item) => item.classList.toggle('active', item.id === `stage-${name}`));
  $$('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.stage === name));
  $$('.workflow-rail li').forEach((item, index) => { const current = Object.keys(titles).indexOf(name); item.classList.toggle('active', item.dataset.stage === name); item.classList.toggle('completed', index < current); });
  $('#pageTitle').textContent = titles[name]; $('#breadcrumb').textContent = `AI Test Studio / ${titles[name]}`; window.scrollTo({ top: 0, behavior: 'smooth' });
  if (name === 'review') loadReviews();
}

function renderStoryPreview() {
  const story = state.stories.find((item) => idOf(item) === $('#storySelect').value);
  $('#storyReady').textContent = story ? 'Đã chọn' : 'Chưa chọn'; $('#storyReady').classList.toggle('ready', Boolean(story));
  if (!story) { $('#storyPreview').className = 'story-preview empty'; $('#storyPreview').textContent = 'Thông tin User Story sẽ xuất hiện tại đây.'; return; }
  $('#storyPreview').className = 'story-preview';
  $('#storyPreview').innerHTML = `<b>${escapeHtml(story.title)}</b><span>${escapeHtml(story.description || 'Không có mô tả')}</span>${story.acceptanceCriteria?.length ? `<ul>${story.acceptanceCriteria.map((item) => `<li>${escapeHtml(item.criteria)}</li>`).join('')}</ul>` : '<p>Chưa có Acceptance Criteria.</p>'}`;
}
async function analyzeWebsite() {
  const payload = contextPayload(); loading(true, 'Playwright đang khám phá website…', 'Đọc DOM, accessibility, form, button, link và network.');
  try {
    const result = await api('/ai/analyze-web-page', { method: 'POST', body: JSON.stringify(payload) }); state.analysis = result.webContext; renderAnalysis(); switchStage('discover'); toast('Đã phân tích website thành công.');
  } catch (error) { toast(error.message, 'error'); } finally { loading(false); }
}
function contextPayload() {
  const projectId = $('#projectSelect').value; const userStoryId = $('#storySelect').value; const testSuiteId = $('#suiteSelect').value; const targetUrl = $('#targetUrl').value.trim();
  if (!projectId || !userStoryId || !testSuiteId || !targetUrl) throw new Error('Project, User Story, Test Suite và URL đều là bắt buộc.');
  return { projectId, userStoryId, testSuiteId, targetUrl, viewportWidth: Number($('#viewportWidth').value), viewportHeight: Number($('#viewportHeight').value) };
}
async function renderAnalysis() {
  $('#analysisEmpty').classList.toggle('hidden', Boolean(state.analysis)); $('#analysisContent').classList.toggle('hidden', !state.analysis); if (!state.analysis) return;
  const page = state.analysis.page || {}; const counts = page.counts || {};
  $('#metricStatus').textContent = state.analysis.pageStatus || 'OK'; $('#metricForms').textContent = counts.forms ?? page.forms?.length ?? 0; $('#metricInputs').textContent = counts.inputs ?? page.inputs?.length ?? 0; $('#metricActions').textContent = (counts.buttons ?? page.buttons?.length ?? 0) + (counts.links ?? page.links?.length ?? 0);
  $('#analyzedUrl').textContent = state.analysis.finalUrl; $('#analyzedTitle').textContent = page.title || 'Website'; $('#analysisTime').textContent = formatDate(state.analysis.analyzedAt);
  const items = [...(page.inputs || []).slice(0, 7).map((item) => ({ icon: 'IN', title: item.label || item.name || item.placeholder || item.type, detail: `${item.type || 'input'} · ${item.selector || item.testId || 'locator detected'}` })), ...(page.buttons || []).slice(0, 6).map((item) => ({ icon: 'BT', title: item.name || item.text || 'Button', detail: item.selector || item.role || 'button' }))];
  $('#elementInventory').innerHTML = items.length ? items.map((item) => `<div class="inventory-item"><span>${item.icon}</span><div><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.detail)}</small></div></div>`).join('') : '<div class="mini-empty">Không phát hiện phần tử tương tác.</div>';
  if (state.screenshotObjectUrl) URL.revokeObjectURL(state.screenshotObjectUrl);
  $('#screenshotFrame').innerHTML = '<span>Đang tải screenshot…</span>';
  try { const blob = await fetchProtectedBlob(state.analysis.screenshotUrl); state.screenshotObjectUrl = URL.createObjectURL(blob); $('#screenshotFrame').innerHTML = `<img src="${state.screenshotObjectUrl}" alt="Screenshot website được Playwright phân tích">`; } catch (error) { $('#screenshotFrame').innerHTML = `<span>${escapeHtml(error.message)}</span>`; }
}

async function generateCases() {
  let payload; try { payload = contextPayload(); } catch (error) { toast(error.message, 'error'); switchStage('context'); return; }
  loading(true, 'AI đang sinh Test Case…', 'Hợp nhất User Story, Acceptance Criteria và website thật.');
  try { const result = await api('/ai/generate-web-test-cases', { method: 'POST', body: JSON.stringify(payload) }); state.analysis = result.analysis; state.cases = result.testCases || []; state.selectedCase = state.cases[0] || null; renderCases(); renderAnalysis(); switchStage('design'); toast(`Đã sinh và lưu ${state.cases.length} Test Case.`); }
  catch (error) { toast(error.message.includes('OPENAI_API_KEY') ? 'Chưa cấu hình AI API key trong file .env.' : error.message, 'error'); }
  finally { loading(false); }
}
async function refreshCases() {
  const suite = $('#suiteSelect').value; if (!suite) return;
  try { state.cases = await api(`/test-cases?testSuite=${suite}&limit=100`); if (state.selectedCase) state.selectedCase = state.cases.find((item) => idOf(item) === idOf(state.selectedCase)) || state.cases[0]; else state.selectedCase = state.cases[0]; renderCases(); } catch (error) { toast(error.message, 'error'); }
}
function renderCases() {
  const has = state.cases.length > 0; $('#designEmpty').classList.toggle('hidden', has); $('#designWorkspace').classList.toggle('hidden', !has); $('#designActions').classList.toggle('hidden', !has); $('#caseCount').textContent = state.cases.length; $('#caseListMeta').textContent = `${state.cases.length} trường hợp`;
  if (!has) return;
  $('#caseList').innerHTML = state.cases.map((item) => `<button type="button" class="case-item ${idOf(item) === idOf(state.selectedCase) ? 'active' : ''}" data-case-id="${idOf(item)}"><div class="case-item-meta"><span class="status-badge ${String(item.status).toLowerCase()}">${escapeHtml(item.status)}</span><span class="priority ${item.priority}">${escapeHtml(item.priority)}</span></div><h4>${escapeHtml(item.title)}</h4><small class="muted">${item.testSteps?.length || 0} steps · ${item.estimatedTime || 0} phút</small></button>`).join('');
  renderCaseEditor(); renderReviewForm(); renderRunCaseOptions(); updateCounts();
}
function renderCaseEditor() {
  const item = state.selectedCase; if (!item) return;
  $('#caseId').value = idOf(item); $('#caseTitle').value = item.title || ''; $('#casePriority').value = item.priority || 'Medium'; $('#caseTime').value = item.estimatedTime || 0; $('#caseDescription').value = item.description || ''; $('#casePreconditions').value = item.preconditions || ''; $('#caseTestData').value = JSON.stringify(item.generatedTestData || {}, null, 2);
  $('#caseStatus').textContent = item.status; $('#caseStatus').className = `status-badge ${String(item.status).toLowerCase()}`; $('#caseOrigin').textContent = item.generatedFrom === 'UserStoryAndWeb' ? 'AI · User Story + Web' : item.generatedFrom;
  $('#stepsEditor').innerHTML = (item.testSteps || []).map(stepTemplate).join('');
}
function stepTemplate(step = {}, index = 0) {
  const actions = ['goto','click','fill','select','check','uncheck','press','assertText','assertVisible','assertUrl','waitForResponse','manual']; const locator = step.locator ? JSON.stringify(step.locator) : '';
  return `<div class="step-card" data-step><div class="step-top"><span class="step-number">${index + 1}</span><input data-field="action" value="${escapeHtml(step.action || '')}" placeholder="Mô tả hành động" required><select data-field="automationAction">${actions.map((action) => `<option ${action === (step.automationAction || 'manual') ? 'selected' : ''}>${action}</option>`).join('')}</select><button type="button" class="remove-step" title="Xóa bước">×</button></div><div class="step-fields"><textarea data-field="expectedResult" placeholder="Expected Result" required>${escapeHtml(step.expectedResult || '')}</textarea><textarea data-field="testData" placeholder="Test data mô tả">${escapeHtml(step.testData || '')}</textarea></div><div class="step-automation"><input data-field="value" value="${escapeHtml(step.value || '')}" placeholder="Value hoặc $variable"><input data-field="locator" value="${escapeHtml(locator)}" placeholder='Locator JSON, ví dụ {"strategy":"role","role":"button","name":"Login"}'><span></span></div></div>`;
}
function readSteps() {
  return $$('[data-step]', $('#stepsEditor')).map((node, index) => { const field = (name) => $(`[data-field="${name}"]`, node).value; const rawLocator = field('locator').trim(); let locator = null; if (rawLocator) locator = parseJson(rawLocator, `Locator ở bước ${index + 1}`); return { stepNumber: index + 1, action: field('action'), expectedResult: field('expectedResult'), testData: field('testData'), automationAction: field('automationAction'), locator, value: field('value') }; });
}
async function saveCase() {
  const id = $('#caseId').value; if (!id) return;
  try {
    const updated = await api(`/test-cases/${id}`, { method: 'PATCH', body: JSON.stringify({ title: $('#caseTitle').value, description: $('#caseDescription').value, preconditions: $('#casePreconditions').value, priority: $('#casePriority').value, estimatedTime: Number($('#caseTime').value), testSteps: readSteps(), generatedTestData: parseJson($('#caseTestData').value, 'Test data') }) });
    state.cases = state.cases.map((item) => idOf(item) === id ? updated : item); state.selectedCase = updated; renderCases(); toast('Đã lưu Test Case.');
  } catch (error) { toast(error.message, 'error'); }
}

function renderReviewForm() {
  const candidates = state.cases.filter((item) => ['Draft', 'NeedsReview'].includes(item.status)); setOptions($('#reviewCase'), candidates, candidates.length ? 'Chọn Test Case' : 'Không có Test Case cần duyệt', (item) => item.title); if (state.selectedCase && candidates.some((item) => idOf(item) === idOf(state.selectedCase))) $('#reviewCase').value = idOf(state.selectedCase);
  renderRunCaseOptions();
}
async function loadReviews() {
  if (!state.user) return;
  try { [state.reviews, state.myReviews] = await Promise.all([api(`/review-requests?status=Pending&reviewer=${idOf(state.user)}&limit=100`), api(`/review-requests?requestedBy=${idOf(state.user)}&limit=20`)]); renderReviews(); } catch (error) { toast(error.message, 'error'); }
}
function renderReviews() {
  $('#reviewQueueCount').textContent = state.reviews.length; $('#reviewCount').textContent = state.reviews.length;
  $('#reviewQueue').innerHTML = state.reviews.length ? state.reviews.map((item) => `<article class="review-item"><span class="status-badge needsreview">Pending</span><h4>${escapeHtml(item.testCase?.title || 'Test Case')}</h4><p>Người gửi: ${escapeHtml(item.requestedBy?.fullName || '—')} · ${formatDate(item.submittedAt)}</p><div class="inline-actions"><button class="primary small-button" data-review-decision="Approved" data-review-id="${idOf(item)}">✓ Approved</button><button class="danger-button small-button" data-review-decision="Rejected" data-review-id="${idOf(item)}">Rejected</button></div></article>`).join('') : '<div class="mini-empty">Không có yêu cầu đang chờ bạn.</div>';
  const latest = state.myReviews.find((item) => ['Rejected', 'Approved', 'Pending'].includes(item.status));
  if (latest) { $('#reviewSubmission').classList.remove('hidden'); $('#reviewSubmission').innerHTML = `<b>${escapeHtml(latest.testCase?.title || 'Test Case')} · ${escapeHtml(latest.status)}</b>${latest.reviewNote ? `<br>${escapeHtml(latest.reviewNote)}` : ''}`; }
}
async function submitReview() {
  const caseId = $('#reviewCase').value; const reviewer = $('#reviewerSelect').value; if (!caseId || !reviewer) throw new Error('Hãy chọn Test Case và QA Lead.');
  const result = await api(`/test-cases/${caseId}/review`, { method: 'POST', body: JSON.stringify({ reviewer, reviewNote: $('#reviewNote').value }) });
  $('#reviewSubmission').classList.remove('hidden'); $('#reviewSubmission').textContent = `Đã gửi yêu cầu ${idOf(result)}. Đang chờ QA Lead xử lý.`; await refreshCases(); toast('Đã gửi QA Lead phê duyệt.');
}
async function decideReview(id, decision) {
  const note = decision === 'Rejected' ? window.prompt('Lý do từ chối Test Case:') : window.prompt('Ghi chú phê duyệt (không bắt buộc):', 'Đã kiểm tra steps, expected result và selector.'); if (note === null) return;
  try { await api(`/review-requests/${id}/decision`, { method: 'PATCH', body: JSON.stringify({ decision, reviewNote: note }) }); toast(decision === 'Approved' ? 'Test Case đã được phê duyệt.' : 'Đã trả Test Case về cho Tester.'); await Promise.all([loadReviews(), refreshCases()]); } catch (error) { toast(error.message, 'error'); }
}

function renderRunCaseOptions() {
  const approved = state.cases.filter((item) => ['Approved', 'Active'].includes(item.status));
  $('#approvedCasePicker').innerHTML = approved.length ? approved.map((item) => `<label class="approved-case-option"><input type="checkbox" name="approvedCase" value="${idOf(item)}" ${idOf(item) === idOf(state.selectedCase) ? 'checked' : ''}><span><b>${escapeHtml(item.title)}</b><small>${item.testSteps?.length || 0} steps · ${escapeHtml(item.priority)}</small></span><span class="status-badge approved">Approved</span></label>`).join('') : '<div class="mini-empty">Chưa có Test Case Approved.</div>';
}
async function prepareRun() {
  if (!state.project) throw new Error('Hãy chọn Project.');
  const testCaseIds = $$('input[name="approvedCase"]:checked').map((input) => input.value);
  if (!testCaseIds.length) throw new Error('Hãy chọn ít nhất một Test Case Approved.');
  loading(true, 'Đang tạo Test Plan & Test Run…', `Chuẩn bị ${testCaseIds.length} Test Case để thực thi.`);
  try {
    state.preparedRun = await api('/test-plans/from-approved', { method: 'POST', body: JSON.stringify({ project: idOf(state.project), testCaseIds, name: $('#planName').value.trim() || undefined, environment: $('#runEnvironment').value }) });
    $('#preparedRunBox').classList.remove('hidden'); $('#preparedRunBox').innerHTML = `<b>${escapeHtml(state.preparedRun.plan.name)}</b>Test Run đã sẵn sàng với ${state.preparedRun.executions.length} Test Execution.`; $('#executeRunButton').disabled = false; toast('Đã tạo Test Plan và Test Run.');
  } finally { loading(false); }
}
async function startRun() {
  if (!state.preparedRun?.run) throw new Error('Hãy tạo Test Plan & Test Run trước khi chạy.');
  const payload = { browser: $('#runBrowser').value, viewportWidth: Number($('#viewportWidth').value), viewportHeight: Number($('#viewportHeight').value), testData: parseJson($('#runTestData').value, 'Override test data') };
  const result = await api(`/test-runs/${idOf(state.preparedRun.run)}/execute`, { method: 'POST', body: JSON.stringify(payload) }); state.jobs = result.jobs || []; state.job = state.jobs[0] || null; state.rootCause = null; renderBatchRun(result.run); switchStage('execute'); pollRun(); toast(`Đã xếp hàng ${state.jobs.length} Playwright job.`);
}
async function pollRun() {
  if (!state.preparedRun?.run) return;
  try {
    const result = await api(`/test-runs/${idOf(state.preparedRun.run)}`); state.jobs = result.automationJobs || []; renderBatchRun(result.run);
    if (result.run.status !== 'Completed') state.pollTimer = setTimeout(pollRun, 1400);
    else {
      state.pollTimer = null; const failed = state.jobs.find((job) => ['Failed', 'Error'].includes(job.status)); const selected = failed || state.jobs[0];
      if (selected) state.job = await api(`/automation/jobs/${idOf(selected)}`); renderRun();
      toast(`Test Run hoàn tất: ${result.run.passedCount} Passed · ${result.run.failedCount} Failed`, result.run.failedCount ? 'error' : 'success');
    }
  } catch (error) { toast(error.message, 'error'); state.pollTimer = setTimeout(pollRun, 3000); }
}
function renderBatchRun(run) {
  const jobs = state.jobs; const progress = jobs.length ? Math.round(jobs.reduce((sum, item) => sum + (item.progress || 0), 0) / jobs.length) : 0;
  $('#runTitle').textContent = run?.name || state.preparedRun?.run?.name || 'Batch Test Run'; $('#runStatus').textContent = run?.status || 'InProgress'; $('#runStatus').className = `status-badge ${(run?.status || 'running').toLowerCase()}`; $('#runProgress').style.width = `${progress}%`; $('#runPercent').textContent = `${progress}%`; $('#runStep').textContent = `${jobs.filter((item) => finalStatuses.has(item.status)).length}/${jobs.length} Test Case hoàn tất`; $('#engineState').textContent = run?.status === 'Completed' ? '● Run completed' : '● Runner active';
  $('#runSteps').innerHTML = jobs.length ? jobs.map((job) => `<div class="run-step"><span>${job.status === 'Passed' ? '✓' : ['Failed','Error'].includes(job.status) ? '!' : '…'}</span><div><b>${escapeHtml(job.suiteName)}</b><small>${job.progress || 0}% · ${Number(job.duration || 0).toFixed(1)} giây</small></div><span class="status-badge ${String(job.status).toLowerCase()}">${escapeHtml(job.status)}</span></div>`).join('') : '<div class="mini-empty">Đang tạo Playwright jobs…</div>';
}
async function cancelRun() { if (!state.job) return; try { await api(`/automation/jobs/${idOf(state.job)}/cancel`, { method: 'POST', body: '{}' }); toast('Đã gửi yêu cầu hủy job.'); } catch (error) { toast(error.message, 'error'); } }
async function renderRun() {
  const job = state.job; $('#evidencePanel').classList.toggle('hidden', !job || !finalStatuses.has(job.status)); $('#diagnoseNextButton').disabled = !job || !['Failed', 'Error'].includes(job.status);
  if (!job) { $('#runTitle').textContent = 'Chưa có Test Run'; $('#runStatus').textContent = 'Idle'; $('#runStatus').className = 'status-badge idle'; $('#runProgress').style.width = '0%'; $('#runPercent').textContent = '0%'; $('#runStep').textContent = 'Chờ bắt đầu'; $('#engineState').textContent = '● Runner idle'; return; }
  $('#runTitle').textContent = job.suiteName; $('#runStatus').textContent = job.status; $('#runStatus').className = `status-badge ${job.status.toLowerCase()}`; $('#runProgress').style.width = `${job.progress || 0}%`; $('#runPercent').textContent = `${job.progress || 0}%`; $('#runStep').textContent = job.currentStep ? `Đang xử lý bước ${job.currentStep}/${job.totalSteps}` : job.status; $('#engineState').textContent = ['Queued','Running'].includes(job.status) ? '● Runner active' : `● ${job.status}`; $('#cancelRunButton').classList.toggle('hidden', !['Queued','Running'].includes(job.status));
  $('#runSteps').innerHTML = job.stepResults?.length ? job.stepResults.map((step) => `<div class="run-step"><span>${step.status === 'Passed' ? '✓' : '!'}</span><div><b>Bước ${step.stepNumber} · ${escapeHtml(step.action || '')}</b><small>${escapeHtml(step.actualResult || step.error || '')}</small></div><span class="status-badge ${String(step.status).toLowerCase()}">${escapeHtml(step.status)}</span></div>`).join('') : '<div class="mini-empty">Job đang chuẩn bị browser và dữ liệu kiểm thử.</div>';
  if (finalStatuses.has(job.status)) await renderEvidence();
}
async function renderEvidence() {
  const job = state.job; if (!job) return; const artifacts = Object.values(job.artifacts || {}); $('#evidenceActions').innerHTML = artifacts.map((item) => `<button type="button" class="ghost-button small-button" data-artifact-url="${escapeHtml(item.url)}" data-artifact-name="${escapeHtml(item.name)}">${item.type?.startsWith('image/') ? 'Xem ảnh' : 'Tải'} ${escapeHtml(item.name)}</button>`).join('');
  const diag = job.diagnostics || {}; $('#evidenceContent').innerHTML = `<div id="evidenceImage" class="mini-empty">${job.artifacts?.screenshot ? 'Đang tải screenshot…' : 'Không có screenshot'}</div><div class="diagnostic-grid"><div><b>${diag.consoleMessages?.length || 0}</b><small>Console messages</small></div><div><b>${diag.failedRequests?.length || 0}</b><small>Failed requests</small></div><div><b>${diag.httpErrors?.length || 0}</b><small>HTTP errors</small></div><div><b>${diag.pageErrors?.length || 0}</b><small>Page errors</small></div></div>`;
  if (job.artifacts?.screenshot) { try { if (state.evidenceObjectUrl) URL.revokeObjectURL(state.evidenceObjectUrl); const blob = await fetchProtectedBlob(job.artifacts.screenshot.url); state.evidenceObjectUrl = URL.createObjectURL(blob); $('#evidenceImage').outerHTML = `<img src="${state.evidenceObjectUrl}" alt="Evidence screenshot">`; } catch (error) { $('#evidenceImage').textContent = error.message; } }
}
async function openArtifact(url, name) { try { const blob = await fetchProtectedBlob(url); const objectUrl = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = objectUrl; link.download = name; link.target = '_blank'; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(objectUrl), 5000); } catch (error) { toast(error.message, 'error'); } }

async function analyzeRoot() {
  if (!state.job || !['Failed','Error'].includes(state.job.status)) { toast('Cần một Test Run Failed hoặc Error để phân tích.', 'error'); return; }
  loading(true, 'AI đang phân tích Root Cause…', 'Đối chiếu evidence với User Story và Test Case.');
  try { state.rootCause = await api(`/ai/analyze-root-cause/${idOf(state.job)}`, { method: 'POST', body: '{}' }); renderRootCause(); renderTriage(); toast('Đã xác định nguyên nhân có khả năng cao nhất.'); }
  catch (error) { toast(error.message.includes('OPENAI_API_KEY') ? 'Chưa cấu hình AI API key trong file .env.' : error.message, 'error'); }
  finally { loading(false); }
}
function renderRootCause() {
  const root = state.rootCause || state.job?.failureAnalysis; const ready = Boolean(root); $('#diagnoseEmpty').classList.toggle('hidden', ready); $('#rootCauseContent').classList.toggle('hidden', !ready); if (!ready) return; state.rootCause = root;
  $('#rootType').textContent = roleFailure(root.failureType); $('#rootConfidence').textContent = `${Math.round((root.confidence || 0) * 100)}% confidence`; $('#rootTitle').textContent = root.mostLikelyRootCause; $('#rootAction').textContent = root.recommendedAction || ''; $('#rootComponent').textContent = `Component · ${root.component || 'Unknown'}`; $('#rootSeverity').textContent = `Severity · ${root.severity}`; $('#rootPriority').textContent = `Priority · ${root.priority}`;
  $('#rootEvidence').innerHTML = root.evidence?.length ? root.evidence.map((item) => `<li>${escapeHtml(item)}</li>`).join('') : '<li>AI chưa tìm thấy evidence đủ mạnh.</li>'; $('#alternativeCauses').innerHTML = root.alternativeCauses?.length ? root.alternativeCauses.map((item) => `<div class="alternative"><b>${escapeHtml(item.cause)}</b><span>${Math.round((item.confidence || 0) * 100)}% khả năng</span></div>`).join('') : '<div class="mini-empty">Không có giả thuyết thay thế.</div>';
}
const roleFailure = (type) => ({ ProductBug: 'Product Bug', TestScript: 'Test Script', TestData: 'Test Data', Environment: 'Environment', FlakyTest: 'Flaky Test', RequirementMismatch: 'Requirement' }[type] || type);
const triageDescriptions = { ProductBug: 'Tạo hoặc liên kết Bug kèm toàn bộ evidence.', TestScript: 'Đưa Test Case về Needs Review để sửa selector hoặc steps.', TestData: 'Thay dữ liệu test và chạy lại cùng Test Case.', Environment: 'Sửa môi trường, kết nối hoặc cấu hình rồi chạy lại.', FlakyTest: 'Đánh dấu không ổn định và lên lịch kiểm tra lại.', RequirementMismatch: 'Đối chiếu lại Acceptance Criteria với sản phẩm.' };
async function renderTriage() {
  const root = state.rootCause || state.job?.failureAnalysis; $('#triageEmpty').classList.toggle('hidden', Boolean(root)); $('.triage-content').classList.toggle('hidden', !root); if (!root) return;
  if (!state.jiraStatus) { try { state.jiraStatus = await api('/integrations/jira/status'); } catch { state.jiraStatus = { configured: false }; } }
  const types = ['ProductBug','TestScript','TestData','Environment','FlakyTest','RequirementMismatch']; $('#triageChoices').innerHTML = types.map((type) => `<label class="triage-choice"><input type="radio" name="failureType" value="${type}" ${type === root.failureType ? 'checked' : ''}><span><b>${roleFailure(type)}</b><small>${escapeHtml(triageDescriptions[type])}</small></span></label>`).join('');
  const duplicates = root.duplicateCandidates || []; $('#existingBug').innerHTML = `<option value="">Chọn Bug</option>${duplicates.map((item) => `<option value="${idOf(item.bug)}">${escapeHtml(item.bug?.title || 'Bug')} · ${Math.round(item.duplicatePercent || 0)}%</option>`).join('')}`; updateTriageOutcome();
}
function updateTriageOutcome() {
  const type = $('input[name="failureType"]:checked')?.value || 'ProductBug'; const action = $('#triageAction').value; const isProduct = type === 'ProductBug'; const jiraOption = state.jiraStatus?.configured ? '<option value="CreateJiraBug">Tạo Bug trên Jira Cloud</option>' : '<option value="CreateJiraBug" disabled>Jira chưa cấu hình</option>'; $('#triageAction').innerHTML = isProduct ? `<option value="CreateBug">Tạo Bug nội bộ</option>${jiraOption}<option value="LinkExistingBug">Liên kết Bug trùng</option>` : '<option value="ReviseAndRerun">Chỉnh sửa và chạy lại</option>'; if ([...$('#triageAction').options].some((item) => item.value === action && !item.disabled)) $('#triageAction').value = action;
  $('#existingBugField').classList.toggle('hidden', !(isProduct && $('#triageAction').value === 'LinkExistingBug')); $('#outcomeTitle').textContent = isProduct ? ($('#triageAction').value === 'LinkExistingBug' ? 'Liên kết Product Bug' : $('#triageAction').value === 'CreateJiraBug' ? 'Tạo Jira Product Bug' : 'Tạo Product Bug nội bộ') : `${roleFailure(type)} · Revise & Rerun`; $('#outcomeDescription').textContent = triageDescriptions[type];
}
async function submitTriage() {
  if (!state.job || !state.rootCause) throw new Error('Chưa có kết quả Root Cause để xác nhận.'); const failureType = $('input[name="failureType"]:checked')?.value; const action = $('#triageAction').value; const bugId = $('#existingBug').value;
  if (action === 'LinkExistingBug' && !bugId) throw new Error('Hãy chọn Bug trùng cần liên kết.'); const result = await api(`/automation-results/${idOf(state.job)}/triage`, { method: 'POST', body: JSON.stringify({ failureType, action, bugId: bugId || undefined, note: $('#triageNote').value, environment: $('#runEnvironment').value }) }); state.job = result.automationResult; state.reroute = failureType; const external = result.jiraIssue ? `<p><a class="jira-link" href="${escapeHtml(result.jiraIssue.url)}" target="_blank" rel="noopener">Mở ${escapeHtml(result.jiraIssue.key)} trên Jira ↗</a></p>` : ''; $('#triageOutcome').innerHTML = `<span class="outcome-icon">✓</span><span class="kicker">Đã xác nhận</span><h3>${failureType === 'ProductBug' ? `Bug ${result.jiraIssue ? 'đã tạo trên Jira' : result.bug ? 'đã được tạo' : 'đã liên kết'}` : 'Đã cập nhật luồng xử lý'}</h3><p>${escapeHtml(triageDescriptions[failureType])}</p>${external}<button type="button" class="primary" id="rerunFromTriage">${failureType === 'TestScript' ? 'Mở Test Case để sửa' : failureType === 'ProductBug' ? 'Hoàn tất phiên' : 'Thay dữ liệu/môi trường và chạy lại'}</button>`; toast('Đã xác nhận kết quả triage.');
}
function updateCounts() { $('#caseCount').textContent = state.cases.length; $('#reviewCount').textContent = state.reviews.length; }

document.addEventListener('click', async (event) => {
  const stageButton = event.target.closest('[data-stage]'); if (stageButton && !stageButton.closest('.workflow-rail li')?.classList.contains('disabled')) { switchStage(stageButton.dataset.stage); return; }
  const authView = event.target.closest('[data-auth-view]'); if (authView) return showAuth(authView.dataset.authView);
  const caseButton = event.target.closest('[data-case-id]'); if (caseButton) { state.selectedCase = state.cases.find((item) => idOf(item) === caseButton.dataset.caseId); renderCases(); return; }
  const removeStep = event.target.closest('.remove-step'); if (removeStep) { removeStep.closest('[data-step]').remove(); $$('.step-number', $('#stepsEditor')).forEach((item, index) => { item.textContent = index + 1; }); return; }
  const decision = event.target.closest('[data-review-decision]'); if (decision) return decideReview(decision.dataset.reviewId, decision.dataset.reviewDecision);
  const artifact = event.target.closest('[data-artifact-url]'); if (artifact) return openArtifact(artifact.dataset.artifactUrl, artifact.dataset.artifactName);
  if (event.target.closest('#profileButton')) return $('#profileMenu').classList.toggle('hidden');
  if (event.target.closest('#logoutButton')) { try { await api('/auth/logout', { method: 'POST', body: '{}' }); } catch {} return logout(); }
  if (event.target.closest('#menuButton')) return $('.sidebar').classList.toggle('open');
  if (event.target.closest('#newWorkflowButton')) { resetWorkflow(); switchStage('context'); return toast('Đã tạo phiên làm việc mới.'); }
  if (event.target.closest('#reanalyzeButton')) return analyzeWebsite();
  if (event.target.closest('#goGenerateButton') || event.target.closest('#generateButton') || event.target.closest('#emptyGenerateButton')) return generateCases();
  if (event.target.closest('#refreshCasesButton')) return refreshCases();
  if (event.target.closest('#addStepButton')) { $('#stepsEditor').insertAdjacentHTML('beforeend', stepTemplate({}, $$('.step-card', $('#stepsEditor')).length)); return; }
  if (event.target.closest('#refreshReviewsButton')) return loadReviews();
  if (event.target.closest('#prepareRunButton')) { try { await prepareRun(); } catch (error) { toast(error.message, 'error'); } return; }
  if (event.target.closest('#cancelRunButton')) return cancelRun();
  if (event.target.closest('#analyzeRootButton')) return analyzeRoot();
  if (event.target.closest('#rerunFromTriage')) {
    if (state.reroute === 'TestScript') { const caseId = idOf(state.job?.testCase); state.selectedCase = state.cases.find((item) => idOf(item) === caseId) || state.selectedCase; renderCases(); return switchStage('design'); }
    if (['TestData', 'Environment', 'FlakyTest', 'RequirementMismatch'].includes(state.reroute)) { state.preparedRun = null; $('#executeRunButton').disabled = true; $('#preparedRunBox').classList.add('hidden'); return switchStage('execute'); }
    return switchStage('context');
  }
});
document.addEventListener('change', async (event) => {
  if (event.target.matches('#projectSelect,#sidebarProject')) { const value = event.target.value; try { await selectProject(value); } finally { $('#projectSelect').value = value; $('#sidebarProject').value = value; } }
  if (event.target.matches('#storySelect')) renderStoryPreview();
  if (event.target.matches('#targetUrl')) { const ready = Boolean(event.target.value.trim()); $('#urlReady').textContent = ready ? 'Đã nhập' : 'Chưa nhập'; $('#urlReady').classList.toggle('ready', ready); }
  if (event.target.matches('input[name="failureType"],#triageAction')) updateTriageOutcome();
});
$('#loginForm').addEventListener('submit', async (event) => { event.preventDefault(); loading(true, 'Đang đăng nhập…'); try { const result = await api('/auth/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.target))) }); localStorage.setItem('etms_token', result.token); await initialize(); toast('Đăng nhập thành công.'); } catch (error) { toast(error.message, 'error'); } finally { loading(false); } });
$('#registerForm').addEventListener('submit', async (event) => { event.preventDefault(); loading(true, 'Đang tạo tài khoản…'); try { await api('/auth/register', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.target))) }); showAuth('login'); $('#loginForm [name="email"]').value = event.target.email.value; toast('Tạo tài khoản thành công. Hãy đăng nhập.'); } catch (error) { toast(error.message, 'error'); } finally { loading(false); } });
$('#contextForm').addEventListener('submit', (event) => { event.preventDefault(); analyzeWebsite(); });
$('#caseEditor').addEventListener('submit', (event) => { event.preventDefault(); saveCase(); });
$('#reviewForm').addEventListener('submit', async (event) => { event.preventDefault(); try { await submitReview(); } catch (error) { toast(error.message, 'error'); } });
$('#runForm').addEventListener('submit', async (event) => { event.preventDefault(); try { await startRun(); } catch (error) { toast(error.message, 'error'); } });
$('#triageForm').addEventListener('submit', async (event) => { event.preventDefault(); try { await submitTriage(); } catch (error) { toast(error.message, 'error'); } });
window.addEventListener('beforeunload', () => { if (state.pollTimer) clearTimeout(state.pollTimer); if (state.screenshotObjectUrl) URL.revokeObjectURL(state.screenshotObjectUrl); if (state.evidenceObjectUrl) URL.revokeObjectURL(state.evidenceObjectUrl); });
initialize();
