const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { options } = require('../../services/automationScriptService');
const { applyFixture } = require('../../services/automationResourcesService');
const { Fixture } = require('../../models/execution-automation/AutomationResources');
const { workspaceRoleHasPermission } = require('../../services/workspaceAccessService');
const { resolveWorkspaceIdFromRequest } = require('../../services/workspaceAccessService');
const { normalizeGeneratedStory, fallbackTestCases, normalizeGeneratedTestCase } = require('../../controllers/e2eController');
const { isGeminiQuotaExhausted } = require('../../services/aiService');
const { exportArtifact } = require('../../services/artifactExportService');
const models = require('../../models');
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
test('E2E fallback provides reviewable scientific test-case components', () => {
  const useCase = { code: 'UC-01', name: 'Nộp bài tập', actor: 'Sinh viên', risk: 'High', preconditions: ['Đã đăng nhập'], postconditions: ['Bài nộp được lưu'], mainFlow: ['Mở bài tập', 'Tải tệp hợp lệ', 'Lưu thay đổi'], alternateFlows: ['Lưu nháp'], exceptionFlows: ['Tệp không hợp lệ'] };
  const story = { priority: 'High', acceptanceCriteria: [{ criteria: 'Given hợp lệ When nộp bài Then trạng thái được lưu' }] };
  const cases = fallbackTestCases({ useCase, story, targetUrl: 'https://e2e.example.test', profile: { roles: [{ name: 'Sinh viên', credentialSecretRef: 'student-e2e' }] } });
  assert.equal(cases.length, 4);
  assert.deepEqual(cases.map((item) => item.journeyType), ['HappyPath', 'Alternate', 'Negative', 'Permission']);
  for (const item of cases) {
    assert.ok(item.objective && item.preconditions && item.postconditions);
    assert.ok(item.testDesignTechniques.length > 0 && item.setup.length > 0 && item.cleanup.length > 0);
    assert.ok(item.storyCoverage.includes('Given hợp lệ When nộp bài Then trạng thái được lưu'));
    assert.ok(item.testSteps.length >= 3);
  }
  const normalized = normalizeGeneratedTestCase({ title: 'Tối giản', testSteps: [] }, 0, { useCase, story, targetUrl: 'https://e2e.example.test', profile: {} });
  assert.ok(normalized.objective && normalized.preconditions && normalized.postconditions);
  assert.deepEqual(normalized.storyCoverage, ['Given hợp lệ When nộp bài Then trạng thái được lưu']);
});
test('test-case Excel export is organized into specification, steps, data and traceability sheets', async () => {
  const result = await exportArtifact('E2E Test Case', {
    testCaseId: 'TC-001', title: 'Nộp bài', objective: 'Xác minh nộp bài.', priority: 'High', testSteps: [{ stepNumber: 1, action: 'Mở bài tập', expectedResult: 'Trang sẵn sàng', automationAction: 'goto' }], generatedTestData: { actor: 'Sinh viên' }, storyCoverage: ['Given hợp lệ When nộp Then lưu'], e2e: { journeyType: 'HappyPath', setup: ['Chuẩn bị dữ liệu'], cleanup: ['Xóa dữ liệu'] }, tags: ['E2E'],
  }, 'xls');
  const xml = result.buffer.toString('utf8');
  assert.equal(result.ext, 'xls');
  for (const sheet of ['Test Case', 'Steps', 'Test Data', 'Traceability']) assert.match(xml, new RegExp(`Worksheet ss:Name="${sheet}"`));
  assert.match(xml, /FreezePanes/);
  assert.match(xml, /Mục tiêu kiểm thử/);
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
