const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeGitHubApiEndpoint } = require('../../services/integrationService');
const { githubGitAuthConfig } = require('../../services/environmentService');
const vm = require('node:vm');
const { options } = require('../../services/automationScriptService');
const { applyFixture } = require('../../services/automationResourcesService');
const { Fixture } = require('../../models/execution-automation/AutomationResources');
const { workspaceRoleHasPermission } = require('../../services/workspaceAccessService');
const { resolveWorkspaceIdFromRequest } = require('../../services/workspaceAccessService');
const { normalizeGeneratedUseCase, normalizeGeneratedStory, fallbackUseCases, fallbackUserStory, fallbackTestCases, normalizeGeneratedTestCase, useCaseScopeFilter } = require('../../controllers/e2eController');
const { isGeminiQuotaExhausted, parseJson } = require('../../services/aiService');
const { exportArtifact, exportTestCases } = require('../../services/artifactExportService');
const models = require('../../models');
test('GitHub repository URLs are repaired to the GitHub API endpoint before verification', () => {
  const connection = { provider: 'GitHub', baseUrl: 'https://github.com/tongkhanh/foodrush.git', externalProjectKey: '' };
  normalizeGitHubApiEndpoint(connection);
  assert.equal(connection.baseUrl, 'https://api.github.com');
  assert.equal(connection.externalProjectKey, 'tongkhanh/foodrush');
  const enterprise = { provider: 'GitHub', baseUrl: 'https://github.example.com/api/v3', externalProjectKey: '' };
  normalizeGitHubApiEndpoint(enterprise);
  assert.equal(enterprise.baseUrl, 'https://github.example.com/api/v3');
});
test('GitHub clone authentication uses a temporary Basic header, not a credential URL', () => {
  const config = githubGitAuthConfig('test-token');
  assert.equal(config, `http.extraHeader=Authorization: Basic ${Buffer.from('x-access-token:test-token').toString('base64')}`);
  assert.ok(!config.includes('github.com'));
});
test('generated standalone scripts parse; WDIO does not depend on testrunner globals', () => {
  const tc = { title: 'Generated', targetUrl: 'http://test', testSteps: [{ automationAction: 'assertVisible', locator: { value: '#login' } }, { automationAction: 'assertText', locator: { value: '#login' }, value: 'Login' }] };
  for (const engine of ['Selenium', 'Cypress', 'WebdriverIO']) new vm.Script(options[engine].compile(tc));
  const source = options.WebdriverIO.compile(tc); assert.ok(source.includes('browser.$')); assert.ok(!source.includes('await expect('));
  assert.ok(options.RobotFramework.compile(tc).includes('remote_url=%{SELENIUM_REMOTE_URL}'));
});
test('workspace responsibility labels retain the complete business toolset', () => {
  assert.equal(workspaceRoleHasPermission('Guest', 'execution:execute'), true);
  assert.equal(workspaceRoleHasPermission('Tester', 'testcase:approve'), true);
  assert.equal(workspaceRoleHasPermission('QA_Manager', 'testcase:approve'), true);
});
test('E2E profile and Use Case routes resolve workspace before checking ai permission', async () => {
  const originalProfileFind = models.SystemProfile.findById;
  const originalUseCaseFind = models.UseCase.findById;
  const originalProjectFind = models.Project.findById;
  const projectId = '507f1f77bcf86cd799439011';
  const workspaceId = '507f191e810c19729de860ea';
  const lookup = (id) => ({ select: async () => ({ _id: id, project: projectId }) });
  models.SystemProfile.findById = lookup;
  models.UseCase.findById = lookup;
  models.Project.findById = () => ({ select: async () => ({ workspace: workspaceId }) });
  try {
    assert.equal(await resolveWorkspaceIdFromRequest({ params: { profileId: 'profile-1' }, originalUrl: '/api/v1/system-profiles/profile-1/suggest-use-cases' }), workspaceId);
    assert.equal(await resolveWorkspaceIdFromRequest({ params: { useCaseId: 'case-1' }, originalUrl: '/api/v1/use-cases/case-1/generate-story' }), workspaceId);
  } finally {
    models.SystemProfile.findById = originalProfileFind;
    models.UseCase.findById = originalUseCaseFind;
    models.Project.findById = originalProjectFind;
  }
});
test('Use Case listing keeps the selected workflow run even when project is also supplied', () => {
  const filter = useCaseScopeFilter({ projectId: 'project-1', profile: { _id: 'run-2', project: 'project-1' } });
  assert.deepEqual(filter, { project: 'project-1', systemProfile: 'run-2' });
  assert.throws(() => useCaseScopeFilter({ projectId: 'project-2', profile: { _id: 'run-2', project: 'project-1' } }), /không thuộc Project/);
});
test('generated E2E User Story converts AI criteria strings to UserStory subdocuments', () => {
  const story = normalizeGeneratedStory({
    title: 'Đặt hàng thành công',
    description: 'As a customer, I want to place an order, so that I receive products.',
    acceptanceCriteria: ['Given a valid cart When I checkout Then the order is created'],
    priority: 'High',
    storyPoints: 5,
  });
  assert.deepEqual(story.acceptanceCriteria, [{ criteria: 'Given a valid cart When I checkout Then the order is created', isCompleted: false }]);
  assert.equal(story.priority, 'High');
  assert.equal(story.storyPoints, 5);
  assert.throws(() => normalizeGeneratedStory({ title: 'Thiếu tiêu chí', description: 'As a user, I want a feature, so that I benefit.' }), /ít nhất một Acceptance Criteria/);
});
test('temporary Gemini high-demand responses use the safe E2E fallback', () => {
  assert.equal(isGeminiQuotaExhausted({ statusCode: 429, message: 'Gemini Free Tier quota exhausted' }), true);
  assert.equal(isGeminiQuotaExhausted({ statusCode: 502, message: 'Gemini API lỗi 503: gemini-3.5-flash is currently experiencing high demand. Please try again later.' }), true);
  assert.equal(isGeminiQuotaExhausted({ statusCode: 502, message: 'Gemini API lỗi 500: invalid response body' }), false);
});
test('malformed Gemini JSON is repaired without exposing a raw SyntaxError', () => {
  const repaired = parseJson('```json\n{"requirements":[{"requirementId":"BR-01"} {"requirementId":"BR-02"}]}\n```');
  assert.deepEqual(repaired.requirements.map((item) => item.requirementId), ['BR-01', 'BR-02']);
  assert.throws(() => parseJson('không có dữ liệu JSON'), (error) => error.statusCode === 502 && /sai cấu trúc/.test(error.message));
});
test('Use Case and User Story fallbacks only derive content from approved source documents', () => {
  const requirement = {
    _id: 'req-1', requirementId: 'BR-03', title: 'Minh bạch tổng tiền',
    description: 'Hiển thị tổng tiền trước khi xác nhận.', objective: 'Khách hàng biết số tiền phải trả.',
    actors: ['Khách hàng'], priority: 'Critical',
    acceptanceCriteria: ['Given giỏ hàng có sản phẩm When khách hàng xem bước xác nhận Then tổng tiền được hiển thị'],
    businessRules: ['Tổng tiền bằng tiền món cộng phí được công bố.'], assumptions: [], dependencies: ['Giỏ hàng'],
  };
  const [useCase] = fallbackUseCases([requirement]);
  assert.equal(useCase.sourceRequirementId, 'req-1');
  assert.equal(useCase.code, 'UC-BR-03');
  assert.equal(useCase.name, requirement.title);
  assert.equal(useCase.actor, 'Khách hàng');
  assert.equal(useCase.risk, 'Critical');
  assert.deepEqual(useCase.preconditions, ['giỏ hàng có sản phẩm']);
  assert.deepEqual(useCase.mainFlow, ['A: khách hàng xem bước xác nhận', 'S: tổng tiền được hiển thị']);
  assert.deepEqual(useCase.postconditions, ['tổng tiền được hiển thị']);
  assert.ok(!JSON.stringify(useCase).includes('khóa học'));

  const story = fallbackUserStory(useCase);
  assert.equal(story.title, requirement.title);
  assert.match(story.description, /Khách hàng/);
  assert.ok(story.acceptanceCriteria.some((item) => item.includes('tổng tiền được hiển thị')));
});
test('AI Use Case normalization always exposes every standard specification field', () => {
  const useCase = normalizeGeneratedUseCase({ code: 'UC-01', name: 'Đăng nhập', actor: 'Người dùng', summary: 'Xác thực tài khoản', risk: 'Critical', trigger: 'Người dùng chọn đăng nhập', preconditions: ['Tài khoản tồn tại'], mainFlow: ['A: Nhập thông tin', 'S: Xác thực'], postconditions: ['Phiên được tạo'], secondaryActors: ['Google'], exceptionFlows: ['2a: Sai mật khẩu'] });
  for (const key of ['code', 'name', 'summary', 'actor', 'secondaryActors', 'risk', 'trigger', 'preconditions', 'mainFlow', 'postconditions', 'exceptionFlows']) assert.ok(useCase[key]?.length || useCase[key]);
  const incomplete = normalizeGeneratedUseCase({ name: 'Thiếu dữ liệu' });
  assert.match(incomplete.trigger, /cần Business Owner hoặc QA xác nhận/i);
  assert.ok(incomplete.assumptions.length > 0);
});
test('E2E fallback provides reviewable scientific test-case components', () => {
  const useCase = { code: 'UC-01', name: 'Nộp bài tập', actor: 'Sinh viên', risk: 'High', preconditions: ['Đã đăng nhập'], postconditions: ['Bài nộp được lưu'], mainFlow: ['Mở bài tập', 'Tải tệp hợp lệ', 'Lưu thay đổi'], alternateFlows: ['Lưu nháp'], exceptionFlows: ['Tệp không hợp lệ'] };
  const story = { priority: 'High', acceptanceCriteria: [{ criteria: 'Given hợp lệ When nộp bài Then trạng thái được lưu' }] };
  const cases = fallbackTestCases({ useCase, story, targetUrl: 'https://e2e.example.test', profile: { roles: [{ name: 'Sinh viên', credentialSecretRef: 'student-e2e' }] } });
  assert.equal(cases.length, 3);
  assert.deepEqual(cases.map((item) => item.journeyType), ['HappyPath', 'Alternate', 'Negative']);
  const permissionCases = fallbackTestCases({ useCase, story, targetUrl: 'https://e2e.example.test', profile: { roles: [{ name: 'Sinh viên' }, { name: 'Giảng viên' }] } });
  assert.ok(permissionCases.some((item) => item.journeyType === 'Permission'));
  for (const item of cases) {
    assert.ok(item.objective && item.preconditions && item.postconditions);
    assert.ok(item.testDesignTechniques.length > 0 && item.setup.length > 0 && item.cleanup.length > 0);
    assert.ok(item.storyCoverage.includes('Given hợp lệ When nộp bài Then trạng thái được lưu'));
    assert.ok(item.testSteps.length >= 3);
  }
  const normalized = normalizeGeneratedTestCase({ title: 'Tối giản', testSteps: [] }, 0, { useCase, story, targetUrl: 'https://e2e.example.test', profile: {} });
  assert.ok(normalized.objective && normalized.preconditions && normalized.postconditions);
  assert.deepEqual(normalized.storyCoverage, ['Given hợp lệ When nộp bài Then trạng thái được lưu']);
  const sourceOnlyCases = fallbackTestCases({ useCase, story, targetUrl: '', profile: { roles: [] } });
  assert.equal(sourceOnlyCases[0].testSteps[0].automationAction, 'manual');
  assert.ok(sourceOnlyCases.every((item) => item.tags.includes('NeedsRuntimeBinding')));
  const sourceOnlyNormalized = normalizeGeneratedTestCase({ title: 'Source-only draft', testSteps: [] }, 0, { useCase, story, targetUrl: '', profile: {} });
  assert.ok(sourceOnlyNormalized.tags.includes('NeedsRuntimeBinding'));
  assert.match(sourceOnlyNormalized.preconditions, /Runtime URL/);
  const unsafeSuggestion = normalizeGeneratedTestCase({ title: 'Manual source', testSteps: [{ action: 'Điều hướng', automationAction: 'goto', locator: { strategy: 'css', value: '#invented' }, value: '/login' }] }, 0, { useCase, story, targetUrl: '', profile: { mode: 'SystemProfile' } });
  assert.equal(unsafeSuggestion.testSteps[0].automationAction, 'manual');
  assert.equal(unsafeSuggestion.testSteps[0].locator, null);
});
test('test-case Excel export is a native workbook with specification, steps, data and traceability sheets', async () => {
  const result = await exportArtifact('E2E Test Case', {
    testCaseId: 'TC-001', title: 'Nộp bài', objective: 'Xác minh nộp bài.', priority: 'High', testSteps: [{ stepNumber: 1, action: 'Mở bài tập', expectedResult: 'Trang sẵn sàng', automationAction: 'goto' }], generatedTestData: { actor: 'Sinh viên' }, storyCoverage: ['Given hợp lệ When nộp Then lưu'], e2e: { journeyType: 'HappyPath', setup: ['Chuẩn bị dữ liệu'], cleanup: ['Xóa dữ liệu'] }, tags: ['E2E'],
  }, 'xlsx');
  const ExcelJS = require('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(result.buffer);
  assert.equal(result.ext, 'xlsx');
  for (const sheet of ['Test Cases', 'Steps', 'Test Data', 'Traceability']) assert.ok(workbook.getWorksheet(sheet));
  assert.equal(workbook.getWorksheet('Test Cases').rowCount, 2);
  assert.match(String(workbook.getWorksheet('Test Cases').getRow(1).values), /Objective/);
});
test('batch Test Case Excel export keeps every case and step in one workbook', async () => {
  const ExcelJS = require('exceljs');
  const output = await exportTestCases([
    { testCaseId: 'TC-001', title: 'Đăng nhập', testSteps: [{ stepNumber: 1, action: 'Mở đăng nhập', expectedResult: 'Hiện biểu mẫu' }], generatedTestData: { role: 'Sinh viên' }, e2e: { journeyType: 'HappyPath' } },
    { testCaseId: 'TC-002', title: 'Nộp bài', testSteps: [{ stepNumber: 1, action: 'Tải tệp', expectedResult: 'Tệp hợp lệ' }, { stepNumber: 2, action: 'Lưu', expectedResult: 'Đã nộp' }], generatedTestData: { file: 'assignment.pdf' }, e2e: { journeyType: 'Negative' } },
  ]);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(output.buffer);
  assert.equal(output.ext, 'xlsx');
  assert.equal(workbook.getWorksheet('Test Cases').rowCount, 3);
  assert.equal(workbook.getWorksheet('Steps').rowCount, 4);
  assert.match(String(workbook.getWorksheet('Test Cases').getRow(3).values), /TC-002/);
});
test('Test Case workbook creates functional sheets from Project data instead of fixed product modules', async () => {
  const ExcelJS = require('exceljs');
  const output = await exportTestCases([
    { testCaseId: 'TC-PAY-01', module: 'Thanh toán FoodRush', feature: 'COD', title: 'Thanh toán COD', primaryTestBasis: { basisType: 'Requirement', code: 'BR-07', title: 'COD' }, coverageItems: ['COD thành công'], testSteps: [{ action: 'Chọn COD', expectedResult: 'Đơn được tạo' }], e2e: {} },
    { testCaseId: 'TC-ORDER-01', module: 'Vận hành đơn', title: 'Nhà hàng xác nhận đơn', primaryTestBasis: { basisType: 'UseCase', code: 'UC-04', title: 'Xác nhận đơn' }, coverageItems: ['Xác nhận trong SLA'], testSteps: [{ action: 'Xác nhận', expectedResult: 'Trạng thái cập nhật' }], e2e: {} },
  ]);
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(output.buffer);
  assert.ok(workbook.getWorksheet('Thanh toán FoodRush'));
  assert.ok(workbook.getWorksheet('Vận hành đơn'));
  assert.ok(workbook.getWorksheet('Summary & Coverage'));
  assert.equal(workbook.getWorksheet('Authentication'), undefined);
  assert.equal(workbook.getWorksheet('Payment'), undefined);
});
test('generic downloads use genuine Excel, Word, PDF and UTF-8 CSV files', async () => {
  const artifact = { title: 'Tài liệu kiểm thử', description: 'Nội dung có dấu tiếng Việt', token: 'secret-value' };
  const xlsx = await exportArtifact('Use Case', artifact, 'xlsx');
  const docx = await exportArtifact('Use Case', artifact, 'docx');
  const pdf = await exportArtifact('Use Case', artifact, 'pdf');
  const csv = await exportArtifact('Use Case', artifact, 'csv');
  const ExcelJS = require('exceljs');
  const mammoth = require('mammoth');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(xlsx.buffer);
  const text = await mammoth.extractRawText({ buffer: docx.buffer });
  assert.equal(xlsx.ext, 'xlsx');
  assert.ok(workbook.getWorksheet('Export'));
  assert.equal(docx.ext, 'docx');
  assert.match(text.value, /Tài liệu kiểm thử/);
  assert.equal(pdf.ext, 'pdf');
  assert.equal(pdf.buffer.subarray(0, 4).toString(), '%PDF');
  assert.equal(csv.ext, 'csv');
  assert.equal(csv.buffer.subarray(0, 3).toString('hex'), 'efbbbf');
  assert.match(csv.buffer.toString('utf8'), /\[REDACTED\]/);
});
test('fixture binds escaped values, rejects missing values and cross-origin calls', async () => {
  const originalFind = Fixture.findById; const originalFetch = global.fetch; let fixture; const calls = [];
  Fixture.findById = async () => fixture;
  global.fetch = async (url, options) => { calls.push({ url, options }); return { ok: true }; };
  try {
    fixture = { setup: [{ method: 'POST', path: '/seed', body: { name: '$name' } }] };
    await applyFixture('test', 'setup', 'http://app.example.com', { name: 'line\n"quoted"' });
    assert.equal(JSON.parse(calls[0].options.body).name, 'line\n"quoted"');
    await assert.rejects(applyFixture('test', 'setup', 'http://app.example.com', {}), /Thiếu biến/);
    fixture = { setup: [{ method: 'POST', path: '//attacker.example.com/steal' }] };
    await assert.rejects(applyFixture('test', 'setup', 'http://app.example.com', {}), /cùng application/);
  } finally { Fixture.findById = originalFind; global.fetch = originalFetch; }
});
