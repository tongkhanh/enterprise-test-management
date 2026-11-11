const { TestPlan, TestRun, TestExecution, AutomationResult, AutomationScript, TestCase, TestSuite, TestEnvironment, SystemProfile, UserStory, Project, Bug, Notification, ExecutionArtifact } = require('../models');
const { AppError, list, getById, send } = require('../utils/http');
const { addKpiPoints } = require('../services/kpiService');
const { createAutomationJob, cancelAutomationJob, getAutomationArtifact } = require('../services/automationRunnerService');
const { getJiraStatus, createJiraBug } = require('../services/jiraService');
const { assertProjectAccess, getAccessibleProjectIds } = require('../services/projectAccessService');
const { exportArtifact } = require('../services/artifactExportService');
const ai = require('../services/aiService');
const { resolveCaseRuntime } = require('../services/e2eRuntimeService');
const { recalculateRun } = require('../services/testRunProgressService');
const { createAutomationRun } = require('../services/multiEngineRunnerService');
const { validateTestCase } = require('../services/automationScriptService');
const { evaluateTestPlan, qualityErrorDetails } = require('../services/documentQualityService');

const ensureProjectAccess = async (req, projectId) => {
  const { project } = await assertProjectAccess(req.user, projectId);
  return project;
};

const listPlans = async (req, res) => {
  const projectIds = req.allowedProjectIds || await getAccessibleProjectIds(req.user);
  const result = await list(TestPlan, req, { baseFilter: { project: { $in: projectIds } }, filters: ['project', 'release', 'status', 'assignee'], searchFields: ['name', 'description', 'scope'], populate: [{ path: 'testCases', select: 'title priority status' }, { path: 'createdBy assignee', select: 'fullName' }, { path: 'release', select: 'name version' }] });
  send(res, result.data.map((item) => ({ ...item.toObject(), quality: evaluateTestPlan(item) })), 200, { pagination: result.pagination });
};
const createPlan = async (req, res) => {
  await ensureProjectAccess(req, req.body.project);
  if (req.body.systemProfile) {
    const profile = await SystemProfile.findById(req.body.systemProfile);
    if (!profile || String(profile.project) !== String(req.body.project)) throw new AppError('System Profile phải thuộc Project.', 409);
    const ids = Array.isArray(req.body.userStories) ? [...new Set(req.body.userStories.map(String))] : [];
    const stories = await UserStory.find({ _id: { $in: ids }, project: req.body.project, 'e2e.systemProfile': profile._id, approvalStatus: 'Approved' });
    if (!ids.length || stories.length !== ids.length) throw new AppError('Test Plan cần User Story đã duyệt thuộc cùng Profile.', 409);
    if ((req.body.kind || 'TestPlan') !== 'TestPlan') throw new AppError('Chỉ có thể lập Feature Test Plan từ User Story.', 409);
    if (req.body.planLevel && req.body.planLevel !== 'Feature') throw new AppError('Test Plan trong luồng E2E phải là Feature Test Plan.', 409);
    req.body.planLevel = 'Feature';
    req.body.origin = req.body.origin === 'AI' ? 'AI' : 'Manual';
    req.body.approvalStatus = 'PendingApproval';
    req.body.status = 'Draft';
  }
  if (req.body.approvalStatus === 'PendingApproval') {
    const quality = evaluateTestPlan(req.body);
    if (!quality.canApprove) throw new AppError(`Test Plan chưa sẵn sàng gửi duyệt. Cần bổ sung: ${quality.requiredMissing.map((field) => field.label).join(', ')}.`, 400, qualityErrorDetails(quality));
  }
  send(res, await TestPlan.create({ ...req.body, createdBy: req.user._id }), 201);
};

const suggestPlan = async (req, res) => {
  const { project: projectId, testCaseIds = [] } = req.body;
  if (!projectId) throw new AppError('project là bắt buộc.', 400);
  await ensureProjectAccess(req, projectId);
  const suites = await TestSuite.find({ project: projectId }).distinct('_id');
  const cases = await TestCase.find({ testSuite: { $in: suites }, status: { $in: ['Approved', 'Active'] }, ...(testCaseIds.length ? { _id: { $in: testCaseIds } } : {}) }).limit(100);
  if (!cases.length) throw new AppError('Project chưa có Test Case Approved để lập Test Plan.', 409);
  if (testCaseIds.length && cases.length !== new Set(testCaseIds.map(String)).size) throw new AppError('Một hoặc nhiều Test Case chưa được duyệt hoặc không thuộc Project.', 409);
  let suggestion = { planId: `TP-${Date.now()}`, name: `Regression Plan · ${new Date().toLocaleDateString('vi-VN')}`, description: 'Kế hoạch kiểm thử được đề xuất từ các Test Case đã duyệt.', scope: cases.map((item) => item.title).join('; '), objectives: ['Xác nhận các E2E journey đã duyệt hoạt động đúng trên môi trường mục tiêu.'], testStrategy: 'Risk-based E2E regression với evidence tự động.', testItems: cases.map((item) => item.title), outOfScope: [], entryCriteria: ['Environment Ready', 'Test Case đã Approved', 'Test data sẵn sàng'], exitCriteria: ['Đã chạy toàn bộ Test Case', 'Bug Critical được triage'], risks: [], deliverables: ['Test execution evidence', 'Defect list', 'Test Summary Report'], environment: req.body.environment || 'Staging' };
  if (ai.isAiConfigured()) {
    try {
      const safeCases = cases.map((item) => ({ title: item.title, priority: item.priority, type: item.type, estimatedTime: item.estimatedTime, coverage: item.storyCoverage }));
      const response = await ai.complete({ system: 'Bạn là Senior QA Test Manager. Chỉ trả JSON. Không suy diễn credential hoặc dữ liệu test.', prompt: `Từ metadata Test Case Approved sau, đề xuất Test Plan đầy đủ. JSON: {"planId":"TP-...","name":"...","description":"...","scope":"...","objectives":[""],"testStrategy":"...","testItems":[""],"outOfScope":[""],"entryCriteria":[""],"exitCriteria":[""],"risks":[{"risk":"","mitigation":"","owner":""}],"deliverables":[""],"environment":"..."}\n${JSON.stringify(safeCases)}`, json: true, temperature: 0.1, maxTokens: 2400 });
      const parsed = ai.parseJson(response.text); suggestion = { ...suggestion, ...parsed, planId: String(parsed.planId || suggestion.planId).slice(0, 80), name: String(parsed.name || suggestion.name).slice(0, 300), description: String(parsed.description || suggestion.description).slice(0, 5000), scope: String(parsed.scope || suggestion.scope).slice(0, 12000), environment: String(parsed.environment || suggestion.environment).slice(0, 500) };
    } catch (error) {
      if (!ai.isGeminiQuotaExhausted(error)) throw error;
      // Only a confirmed Gemini quota limit may use the deterministic plan above.
    }
  }
  const kind = req.body.kind === 'ExecutionPlan' ? 'ExecutionPlan' : 'TestPlan';
  if (req.body.systemProfile && cases.some((item) => String(item.e2e?.systemProfile || '') !== String(req.body.systemProfile))) throw new AppError('Test Case phải thuộc cùng System Profile.', 409);
  const plan = await TestPlan.create({ ...suggestion, kind, planLevel: kind === 'ExecutionPlan' ? 'CycleExecution' : (req.body.planLevel || 'Feature'), origin: kind === 'ExecutionPlan' ? 'Board' : (ai.isAiConfigured() ? 'AI' : 'Rule'), systemProfile: req.body.systemProfile || null, project: projectId, testCases: cases.map((item) => item._id), assignee: req.body.assignee || req.user._id, createdBy: req.user._id, status: 'Draft', approvalStatus: 'PendingApproval', aiSuggestion: suggestion });
  send(res, plan, 201, { message: `Đã tạo ${kind === 'ExecutionPlan' ? 'Test Execution Plan' : 'Test Plan'} từ ${cases.length} Test Case Approved.` });
};

const suggestPlanFromRequirements = async (req, res) => {
  const { project: projectId, userStories = [], environment = 'Staging' } = req.body;
  if (!projectId) throw new AppError('project là bắt buộc.', 400);
  await ensureProjectAccess(req, projectId);
  const stories = Array.isArray(userStories) ? userStories.slice(0, 30) : [];
  if (!stories.length) throw new AppError('Cần ít nhất một User Story đã duyệt để AI đề xuất Test Plan.', 400);
  const titles = stories.map((item) => String(item.title || '').trim()).filter(Boolean);
  const suggestion = {
    name: `E2E Test Plan · ${new Date().toLocaleDateString('vi-VN')}`,
    scope: titles.join('; '),
    objectives: ['Xác nhận các User Story đã duyệt hoạt động đúng theo tiêu chí chấp nhận.'],
    testStrategy: 'Risk-based E2E testing, ưu tiên luồng chính, xác thực và phân quyền.',
    testItems: titles,
    outOfScope: ['Hiệu năng chuyên sâu và kiểm thử bảo mật xâm nhập, trừ khi có yêu cầu riêng.'],
    entryCriteria: ['User Story đã được duyệt.', 'Môi trường và dữ liệu kiểm thử sẵn sàng.'],
    exitCriteria: ['Test Case trong phạm vi đã được thực thi hoặc có lý do Blocked được ghi nhận.', 'Bug Critical/High đã được triage.'],
    environment: String(environment || 'Staging').slice(0, 500),
    testData: 'Dùng tài khoản và dữ liệu thử nghiệm đã khai báo trong System Profile.',
    risks: [{ risk: 'Môi trường không ổn định hoặc dữ liệu kiểm thử không nhất quán.', mitigation: 'Ghi evidence, xác nhận dữ liệu và triage trước khi kết luận.', owner: 'QA Manager' }],
    deliverables: ['Test Plan đã duyệt', 'Test Case và evidence thực thi', 'Danh sách defect', 'Test Summary Report'],
  };
  let fallback = !ai.isAiConfigured();
  if (ai.isAiConfigured()) {
    try {
      const response = await ai.complete({ system: 'Bạn là QA Test Manager. Chỉ trả JSON.', prompt: `Dựa trên các User Story đã duyệt, đề xuất Test Plan trước khi viết Test Case. JSON: {"name":"","scope":"","objectives":[""],"testStrategy":"","testItems":[""],"outOfScope":[""],"entryCriteria":[""],"exitCriteria":[""],"environment":"","testData":"","risks":[{"risk":"","mitigation":"","owner":""}],"deliverables":[""]}. Không bịa trạng thái, số liệu, credential hoặc môi trường chưa có bằng chứng.\n${JSON.stringify(stories)}`, json: true, temperature: 0.15, maxTokens: 2200 });
      const parsed = ai.parseJson(response.text); Object.assign(suggestion, parsed || {});
    } catch (error) { if (!ai.isGeminiQuotaExhausted(error)) throw error; fallback = true; }
  }
  send(res, { suggestion, fallback });
};

const decidePlan = async (req, res) => {
  const plan = await getById(TestPlan, req.params.id); await assertProjectAccess(req.user, plan.project, { manage: true });
  if (!['Approved', 'Rejected'].includes(req.body.decision)) throw new AppError('decision phải là Approved hoặc Rejected.', 400);
  if (plan.approvalStatus !== 'PendingApproval') throw new AppError('Test Plan không ở trạng thái chờ duyệt.', 409);
  if (req.body.decision === 'Rejected' && !String(req.body.reviewNote || '').trim()) throw new AppError('Cần nhập lý do từ chối.', 400);
  if (req.body.decision === 'Approved') {
    const quality = evaluateTestPlan(plan);
    if (!quality.canApprove) throw new AppError(`Test Plan chưa sẵn sàng duyệt. Cần bổ sung: ${quality.requiredMissing.map((field) => field.label).join(', ')}.`, 400, qualityErrorDetails(quality));
  }
  plan.approvalStatus = req.body.decision; plan.reviewNote = String(req.body.reviewNote || '').trim().slice(0, 2000);
  plan.approvedBy = req.body.decision === 'Approved' ? req.user._id : null; plan.approvedAt = req.body.decision === 'Approved' ? new Date() : null; plan.status = req.body.decision === 'Approved' ? 'Active' : 'Draft'; await plan.save(); send(res, plan);
};

const createPlanFromApproved = async (req, res) => {
  const { project: projectId, testCaseIds } = req.body;
  if (!projectId || !Array.isArray(testCaseIds) || !testCaseIds.length) {
    throw new AppError('project và danh sách testCaseIds là bắt buộc.', 400);
  }
  if (testCaseIds.length > 100) throw new AppError('Mỗi Test Plan hỗ trợ tối đa 100 Test Case.', 400);
  await ensureProjectAccess(req, projectId);
  const cases = await TestCase.find({ _id: { $in: testCaseIds } }).populate('testSuite', 'project');
  if (cases.length !== new Set(testCaseIds.map(String)).size) throw new AppError('Một hoặc nhiều Test Case không tồn tại.', 404);
  const invalid = cases.filter((item) => !['Approved', 'Active'].includes(item.status) || item.type !== 'Automated' || !item.targetUrl || item.testSteps.some((step) => !step.automationAction || step.automationAction === 'manual') || String(item.testSuite?.project) !== String(projectId));
  if (invalid.length) {
    throw new AppError('Tất cả Test Case phải thuộc Project, ở trạng thái Approved, có targetUrl và mọi step phải tự động hóa được.', 409, {
      invalidTestCases: invalid.map((item) => ({ id: item._id, title: item.title, status: item.status, type: item.type })),
    });
  }
  const now = new Date();
  const plan = await TestPlan.create({
    name: req.body.name || `Automation Plan · ${now.toLocaleString('vi-VN')}`,
    description: req.body.description || 'Gom các Test Case đã được QA Manager phê duyệt.',
    scope: cases.map((item) => item.title).join('; '), status: 'Active', approvalStatus: 'Approved', approvedBy: req.user._id, approvedAt: now,
    environment: req.body.environment || 'Staging', project: projectId,
    testCases: cases.map((item) => item._id), assignee: req.body.assignee || req.user._id,
    createdBy: req.user._id, startDate: now,
  });
  const run = await TestRun.create({
    name: req.body.runName || `Run · ${plan.name}`,
    description: 'Playwright batch execution', environment: plan.environment,
    status: 'NotStarted', totalCases: cases.length, testPlan: plan._id,
    assignee: plan.assignee, createdBy: req.user._id,
  });
  const executions = await TestExecution.insertMany(cases.map((testCase) => ({
    testRun: run._id, testCase: testCase._id, result: 'NotRun', executedBy: req.user._id,
  })));
  send(res, { plan, run, executions }, 201, { message: `Đã tạo Test Plan với ${cases.length} Test Case Approved.` });
};
const updatePlan = async (req, res) => { const item = await getById(TestPlan, req.params.id); await ensureProjectAccess(req, item.project); req._auditBefore = item.toObject(); const wasApproved = item.approvalStatus === 'Approved'; Object.assign(item, req.body); if (wasApproved) { item.approvalStatus = 'Draft'; item.status = 'Draft'; item.reviewNote = ''; item.approvedBy = null; item.approvedAt = null; } await item.save(); send(res, item); };
const exportPlan = async (req, res) => {
  const plan = await TestPlan.findById(req.params.id)
    .populate('testCases release cycle assignee createdBy approvedBy')
    .lean();
  if (!plan) throw new AppError('Test Plan không tồn tại.', 404);
  await ensureProjectAccess(req, plan.project);
  // Legacy `doc` and `xls` links remain accepted, but the generated download is
  // always a standards-compliant DOCX/XLSX file with the matching extension.
  const format = ['docx', 'pdf', 'xlsx', 'csv', 'doc', 'xls'].includes(req.query.format) ? req.query.format : 'docx';
  const output = ['docx', 'pdf'].includes(format) ? await require('../services/testPlanExportService').exportTestPlan(plan, format) : await exportArtifact('Test Plan', plan, format);
  res.setHeader('Content-Type', output.mime);
  res.setHeader('Content-Disposition', `attachment; filename="test-plan-${plan._id}.${output.ext}"`);
  res.send(output.buffer);
};
const exportPlanPreview = async (req, res) => {
  if (!req.body.project || !req.body.plan || typeof req.body.plan !== 'object' || Array.isArray(req.body.plan)) throw new AppError('Project và nội dung Test Plan là bắt buộc.', 400);
  await ensureProjectAccess(req, req.body.project);
  const format = req.query.format;
  if (!['docx', 'pdf'].includes(format)) throw new AppError('Chỉ hỗ trợ DOCX hoặc PDF.', 400);
  // Export only the supplied document; do not create a plan or change approval state.
  const output = await require('../services/testPlanExportService').exportTestPlan({ ...req.body.plan, approvalStatus: 'Draft', planId: '' }, format);
  res.setHeader('Content-Type', output.mime);
  res.setHeader('Content-Disposition', `attachment; filename="test-plan-draft.${output.ext}"`);
  res.send(output.buffer);
};
const deletePlan = async (req, res) => { const item = await getById(TestPlan, req.params.id); await ensureProjectAccess(req, item.project); if (await TestRun.exists({ testPlan: item._id })) throw new AppError('Không thể xóa kế hoạch đã có đợt chạy.', 409); req._auditBefore = item.toObject(); await item.deleteOne(); send(res, { _id: item._id }); };

const listRuns = async (req, res) => {
  const projectIds = req.allowedProjectIds || await getAccessibleProjectIds(req.user);
  const planIds = await TestPlan.find({ project: { $in: projectIds } }).distinct('_id');
  const result = await list(TestRun, req, { baseFilter: { testPlan: { $in: planIds } }, filters: ['testPlan', 'status', 'assignee'], searchFields: ['name', 'description'], populate: [{ path: 'testPlan', select: 'name project' }, { path: 'createdBy assignee', select: 'fullName' }] });
  send(res, result.data, 200, { pagination: result.pagination });
};

const createRun = async (req, res) => {
  const plan = await getById(TestPlan, req.body.testPlan);
  await ensureProjectAccess(req, plan.project);
  if (plan.kind === 'ExecutionPlan' && (plan.approvalStatus !== 'Approved' || !plan.testCases.length)) throw new AppError('Execution Plan phải được duyệt và có Test Case trước khi tạo Test Run.', 409);
  const run = await TestRun.create({ ...req.body, totalCases: plan.testCases.length, createdBy: req.user._id });
  if (plan.testCases.length) await TestExecution.insertMany(plan.testCases.map((testCase) => ({ testRun: run._id, testCase })));
  send(res, run, 201);
};

const updateRun = async (req, res) => { const item = await getById(TestRun, req.params.id); const plan = await getById(TestPlan, item.testPlan); await ensureProjectAccess(req, plan.project); req._auditBefore = item.toObject(); Object.assign(item, req.body); if (item.status === 'InProgress' && !item.startedAt) item.startedAt = new Date(); if (item.status === 'Completed' && !item.completedAt) item.completedAt = new Date(); await item.save(); send(res, item); };

const getRun = async (req, res) => {
  const run = await getById(TestRun, req.params.id, [{ path: 'testPlan', select: 'name project environment kind approvalStatus' }, { path: 'assignee', select: 'fullName' }]);
  await ensureProjectAccess(req, run.testPlan.project);
  const executions = await TestExecution.find({ testRun: run._id })
    .populate('testCase', 'title testSteps priority type status e2e targetUrl updatedAt')
    .populate('executedBy', 'fullName')
    .populate('automationRun', 'status engine script result error')
    .sort('createdAt').lean();
  await Promise.all(executions.map(async (execution) => {
    let runtime;
    try {
      runtime = execution.testCase ? await resolveCaseRuntime(execution.testCase) : null;
    } catch (error) {
      if (error.statusCode !== 409) throw error;
    }
    const url = URL.parse(runtime?.targetUrl || '');
    execution.runtimeUrl = url && ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? runtime.targetUrl : '';
    execution.environmentId = runtime?.environmentId || null;
  }));
  const scripts = await AutomationScript.find({
    project: run.testPlan.project, status: 'Approved', testCase: { $in: executions.flatMap((execution) => execution.testCase ? [execution.testCase._id] : []) },
  }).select('testCase engine filename runtimeUrl sourceCaseUpdatedAt').sort({ approvedAt: -1 }).lean();
  const automationJobs = await AutomationResult.find({ testRun: run._id })
    .select('suiteName status progress testCase testExecution duration artifacts failureAnalysis createdAt completedAt')
    .sort('createdAt');
  send(res, { run, executions, automationJobs, scripts });
};

const executeAutomatedRun = async (req, res) => {
  const run = await getById(TestRun, req.params.id, { path: 'testPlan' });
  const plan = run.testPlan;
  await ensureProjectAccess(req, plan.project);
  if (!['NotStarted', 'Aborted'].includes(run.status)) throw new AppError('Test Run này đã bắt đầu hoặc đã hoàn tất.', 409);
  const cases = await TestCase.find({ _id: { $in: plan.testCases } });
  if (plan.kind === 'ExecutionPlan' && plan.approvalStatus !== 'Approved') throw new AppError('Execution Plan phải được duyệt trước khi chạy.', 409);
  let chosenEnvironment = null;
  if (req.body.testEnvironmentId) {
    chosenEnvironment = await TestEnvironment.findById(req.body.testEnvironmentId);
    if (!chosenEnvironment || String(chosenEnvironment.project) !== String(plan.project) || chosenEnvironment.status !== 'Ready' || !chosenEnvironment.targetUrl) throw new AppError('Test Environment phải thuộc Project và ở trạng thái Ready.', 409);
  }
  const invalid = [];
  for (const item of cases) {
    const runtime = await resolveCaseRuntime(item);
    const targetUrl = chosenEnvironment?.targetUrl || runtime?.targetUrl || '';
    const validation = validateTestCase({ targetUrl, testSteps: item.testSteps });
    if (!['Approved', 'Active'].includes(item.status) || item.type !== 'Automated' || validation.some((issue) => issue.level === 'error')) invalid.push(item);
  }
  if (invalid.length || cases.length !== plan.testCases.length) throw new AppError('Test Plan chứa Test Case chưa Approved, thiếu runtime, locator hoặc còn bước thủ công.', 409);
  run.status = 'InProgress'; run.startedAt = new Date(); run.completedAt = null; await run.save();
  const jobs = [];
  for (const testCase of cases) {
    jobs.push(await createAutomationJob({
      testCaseId: testCase._id, userId: req.user._id, testRunId: run._id, testPlanId: plan._id,
      browserName: req.body.browser || 'chromium',
      viewport: { width: req.body.viewportWidth, height: req.body.viewportHeight },
      testData: req.body.testData || {}, environment: run.environment || plan.environment || 'Staging',
      testEnvironmentId: req.body.testEnvironmentId,
    }));
  }
  send(res, { plan, run, jobs }, 202, { message: `Đã xếp hàng ${jobs.length} Playwright job.` });
};

const executeReviewedScript = async (req, res) => {
  const execution = await getById(TestExecution, req.params.id);
  const run = await getById(TestRun, execution.testRun, 'testPlan');
  const plan = run.testPlan;
  await ensureProjectAccess(req, plan.project);
  if (plan.kind === 'ExecutionPlan' && plan.approvalStatus !== 'Approved') throw new AppError('Execution Plan phải được duyệt trước khi chạy.', 409);
  const testCase = await getById(TestCase, execution.testCase);
  const runtime = await resolveCaseRuntime(testCase);
  if (!runtime?.environmentId) throw new AppError('Hãy gắn Environment Ready trước khi chạy script.', 409);
  const automationRun = await createAutomationRun({
    scriptId: req.body.scriptId, environmentId: runtime.environmentId, userId: req.user._id,
    execution, dataset: req.body.dataset, fixture: req.body.fixture,
  });
  send(res, automationRun, 202);
};

const recordExecution = async (req, res) => {
  let execution = await getById(TestExecution, req.params.id);
  const currentRun = await getById(TestRun, execution.testRun, 'testPlan');
  await ensureProjectAccess(req, currentRun.testPlan.project);
  req._auditBefore = execution.toObject();
  const editable = ['result', 'duration', 'notes', 'actualResult', 'evidence', 'stepResults', 'bugReported'];
  const updates = Object.fromEntries(editable.filter((key) => req.body[key] !== undefined).map((key) => [key, req.body[key]]));
  if (req.body.result !== undefined) updates.qaVerdict = ['Passed', 'Failed'].includes(req.body.result) ? req.body.result : null;
  execution = await TestExecution.findByIdAndUpdate(execution._id, { ...updates, executedBy: req.user._id, executedAt: new Date() }, { new: true, runValidators: true });
  const run = await recalculateRun(execution.testRun);
  const plan = await getById(TestPlan, run.testPlan);
  await addKpiPoints({ user: req.user._id, project: plan.project, points: 1, reason: 'Thực thi test case', entityType: 'TestExecution', entityId: execution._id, counters: { testCasesExecuted: 1 } });
  if (run.status === 'Completed' && run.assignee) await Notification.create({ type: 'TestRunCompleted', title: 'Test Run hoàn tất', message: `Đợt chạy “${run.name}” đã hoàn tất.`, recipient: run.assignee, sender: req.user._id, relatedEntity: { entityType: 'TestRun', entityId: run._id }, link: `/execution.html?run=${run._id}` });
  send(res, { execution, run });
};

const automationWebhook = async (req, res) => {
  const configuredSecret = process.env.AUTOMATION_WEBHOOK_SECRET;
  if (configuredSecret && req.headers['x-webhook-secret'] !== configuredSecret) throw new AppError('Webhook secret không hợp lệ.', 401);
  const payload = req.body;
  if (!payload.project || !payload.suiteName || !payload.framework) throw new AppError('project, suiteName và framework là bắt buộc.', 400);
  const totalTests = Number(payload.totalTests ?? payload.total ?? 0);
  const passed = Number(payload.passed ?? 0); const failed = Number(payload.failed ?? 0); const skipped = Number(payload.skipped ?? 0);
  const status = payload.status || (failed > 0 ? 'Failed' : 'Passed');
  const result = await AutomationResult.create({
    suiteName: payload.suiteName, framework: payload.framework, status,
    duration: Number(payload.duration || 0), totalTests, passed, failed, skipped,
    buildNumber: payload.buildNumber, pipelineUrl: payload.pipelineUrl,
    triggeredBy: 'Webhook', payload, errorLogs: payload.errorLogs,
    testRun: payload.testRun || null, project: payload.project,
  });
  if (Array.isArray(payload.artifacts)) {
    const source = payload.framework === 'Robot' ? 'RobotFramework' : payload.framework;
    await ExecutionArtifact.insertMany(payload.artifacts.slice(0, 100).filter((x) => x?.uri && x?.name).map((x) => ({ project: payload.project, automationResult: result._id, source: ['Playwright', 'Selenium', 'Cypress', 'WebdriverIO', 'RobotFramework', 'Docker', 'Application', 'Database', 'CI'].includes(x.source || source) ? (x.source || source) : 'CI', artifactType: x.artifactType || 'Other', name: x.name, mimeType: x.mimeType || 'application/octet-stream', uri: x.uri, checksum: x.checksum || '', size: Number(x.size || 0), metadata: x.metadata || {} })));
  }
  let run = null;
  if (payload.testRun) {
    run = await TestRun.findByIdAndUpdate(payload.testRun, {
      totalCases: totalTests, passedCount: passed, failedCount: failed, skippedCount: skipped,
      status: 'Completed', completedAt: new Date(), startedAt: payload.startedAt || new Date(),
    }, { new: true });
  }
  send(res, { automationResult: result, testRun: run }, 202);
};

const listAutomationResults = async (req, res) => {
  const projectIds = req.allowedProjectIds || await getAccessibleProjectIds(req.user);
  const result = await list(AutomationResult, req, { baseFilter: { project: { $in: projectIds } }, filters: ['project', 'testRun', 'framework', 'status', 'buildNumber'], searchFields: ['suiteName'], populate: [{ path: 'testRun', select: 'name' }, { path: 'project', select: 'name key' }] });
  send(res, result.data, 200, { pagination: result.pagination });
};

const runAutomatedTestCase = async (req, res) => {
  const testCase = await getById(TestCase, req.params.testCaseId);
  const suite = await getById(TestSuite, testCase.testSuite);
  await ensureProjectAccess(req, suite.project);
  const job = await createAutomationJob({
    testCaseId: testCase._id, userId: req.user._id,
    testRunId: req.body.testRunId, testPlanId: req.body.testPlanId,
    browserName: req.body.browser || 'chromium',
    viewport: { width: req.body.viewportWidth, height: req.body.viewportHeight },
    testData: req.body.testData || {}, environment: req.body.environment || 'Staging',
    testEnvironmentId: req.body.testEnvironmentId,
  });
  send(res, job, 202, { message: 'Automation job đã được xếp hàng.' });
};

const getAutomationJob = async (req, res) => {
  const job = await AutomationResult.findById(req.params.id)
    .populate('testCase', 'title priority status targetUrl storyCoverage testSteps')
    .populate('testRun', 'name status environment')
    .populate('testPlan', 'name status')
    .populate('project', 'name key lead members')
    .populate('requestedBy', 'fullName email');
  if (!job) throw new AppError('Automation job không tồn tại.', 404);
  await ensureProjectAccess(req, job.project._id);
  send(res, job);
};

const cancelAutomation = async (req, res) => {
  const job = await AutomationResult.findById(req.params.id);
  if (!job) throw new AppError('Automation job không tồn tại.', 404);
  await ensureProjectAccess(req, job.project);
  if (!['Queued', 'Running'].includes(job.status)) throw new AppError('Chỉ job Queued hoặc Running mới có thể hủy.', 409);
  const cancelled = await cancelAutomationJob(job._id);
  send(res, cancelled, 200, { message: 'Đã gửi yêu cầu hủy job.' });
};

const downloadAutomationArtifact = async (req, res) => {
  const { result, artifact, filePath } = await getAutomationArtifact(req.params.id, req.params.name);
  await ensureProjectAccess(req, result.project);
  res.setHeader('Content-Type', artifact.type || 'application/octet-stream');
  res.setHeader('Content-Disposition', artifact.type?.startsWith('image/') ? 'inline' : `attachment; filename="${artifact.name}"`);
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.sendFile(filePath);
};

const triageAutomationResult = async (req, res) => {
  const result = await AutomationResult.findById(req.params.id);
  if (!result) throw new AppError('Automation Result không tồn tại.', 404);
  await ensureProjectAccess(req, result.project);
  if (!result.failureAnalysis) throw new AppError('Hãy chạy AI Root Cause Analyzer trước khi triage.', 409);
  const failureType = req.body.failureType || result.failureAnalysis.failureType;
  const allowed = new Set(['ProductBug', 'TestScript', 'TestData', 'Environment', 'FlakyTest', 'RequirementMismatch']);
  if (!allowed.has(failureType)) throw new AppError('failureType không hợp lệ.', 400);
  let bug = null; let jiraIssue = null;
  if (failureType === 'ProductBug') {
    if (req.body.action === 'LinkExistingBug') {
      bug = await Bug.findOne({ _id: req.body.bugId, project: result.project });
      if (!bug) throw new AppError('Bug được chọn không tồn tại trong Project.', 404);
    } else {
      const testCase = await TestCase.findById(result.testCase);
      const analysis = result.failureAnalysis;
      bug = await Bug.create({
        title: req.body.title || `[Automation] ${testCase?.title || result.suiteName}`,
        description: req.body.description || `${analysis.mostLikelyRootCause}\n\nAI confidence: ${Math.round((analysis.confidence || 0) * 100)}%`,
        stepsToReproduce: testCase?.testSteps?.map((step) => `${step.stepNumber}. ${step.action}\nExpected: ${step.expectedResult}`).join('\n') || '',
        severity: analysis.severity || 'Major', priority: analysis.priority || 'High',
        environment: result.testRun?.environment || result.runtimeConfig?.environment || 'Staging', browser: result.browserName,
        attachments: Object.values(result.artifacts || {}).filter((item) => item?.url).map((item) => ({ fileName: item.name, fileUrl: item.url, fileType: item.type })),
        project: result.project, reportedBy: req.user._id, assignedTo: req.body.assignedTo || null,
        approvalStatus: 'PendingApproval', jiraRequested: req.body.action === 'CreateJiraBug',
        testExecution: result.testExecution, userStory: result.userStory, automationResult: result._id,
        rootCause: { summary: analysis.mostLikelyRootCause, confidence: analysis.confidence, failureType, evidence: analysis.evidence || [] },
        tags: ['Automation', 'AI-Root-Cause'],
      });
      if (req.body.action === 'CreateJiraBug' && bug.approvalStatus === 'Approved') {
        const jiraAttachments = [];
        for (const artifact of Object.values(result.artifacts || {})) {
          if (!artifact?.name) continue;
          try {
            const resolved = await getAutomationArtifact(result._id, artifact.name);
            jiraAttachments.push({ path: resolved.filePath, name: artifact.name, type: artifact.type });
          } catch (_) { /* Artifact hết hạn không được làm mất luồng tạo Jira. */ }
        }
        try {
          jiraIssue = await createJiraBug({
            summary: bug.title, rootCause: analysis.mostLikelyRootCause,
            confidence: analysis.confidence, severity: analysis.severity, priority: analysis.priority,
            environment: req.body.environment || 'Staging', targetUrl: result.targetUrl,
            steps: bug.stepsToReproduce, evidence: analysis.evidence, attachments: jiraAttachments,
          });
          bug.externalIssue = {
            provider: 'Jira', id: jiraIssue.id, key: jiraIssue.key, url: jiraIssue.url,
            syncedAt: jiraIssue.syncedAt, attachmentWarnings: jiraIssue.warnings || [],
          };
          await bug.save({ validateBeforeSave: false });
        } catch (error) {
          await bug.deleteOne();
          throw error;
        }
      }
      const aiService = require('../services/aiService');
      if (aiService.isEmbeddingConfigured()) {
        aiService.indexBugAndFindDuplicates(bug).catch(() => null);
      }
    }
    await TestExecution.findByIdAndUpdate(result.testExecution, { bugReported: bug._id });
  } else if (failureType === 'TestScript') {
    await TestCase.findByIdAndUpdate(result.testCase, { status: 'NeedsReview' });
  }
  result.triage = {
    status: 'Confirmed', failureType,
    action: failureType === 'ProductBug' ? (req.body.action || 'CreateBug') : req.body.action || 'ReviseAndRerun',
    note: req.body.note || '', bug: bug?._id || null,
    confirmedBy: req.user._id, confirmedAt: new Date(),
  };
  await result.save({ validateBeforeSave: false });
  send(res, { automationResult: result, bug, jiraIssue }, 200, { message: 'Đã xác nhận kết quả triage.' });
};

const jiraIntegrationStatus = async (_req, res) => send(res, getJiraStatus());

module.exports = {
  exportPlanPreview,
  listPlans, createPlan, suggestPlan, suggestPlanFromRequirements, decidePlan, updatePlan, exportPlan, deletePlan, listRuns, createRun, updateRun, getRun,
  createPlanFromApproved, executeAutomatedRun, executeReviewedScript,
  recordExecution, automationWebhook, listAutomationResults,
  runAutomatedTestCase, getAutomationJob, cancelAutomation, downloadAutomationArtifact, triageAutomationResult,
  jiraIntegrationStatus,
};
