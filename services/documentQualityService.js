const present = (value) => {
  if (Array.isArray(value)) return value.some((item) => present(item));
  if (value && typeof value === 'object') return Object.keys(value).length > 0;
  return value !== null && value !== undefined && String(value).trim() !== '';
};

const criteriaText = (item) => typeof item === 'string' ? item : item?.criteria;
const stepIsComplete = (step) => present(step?.action) && present(step?.expectedResult);
const field = (key, label, valid) => ({ key, label, valid: Boolean(valid) });

const finish = (required, recommended = []) => {
  const requiredMissing = required.filter((item) => !item.valid).map(({ key, label }) => ({ key, label }));
  const recommendedMissing = recommended.filter((item) => !item.valid).map(({ key, label }) => ({ key, label }));
  const completed = required.filter((item) => item.valid).length + recommended.filter((item) => item.valid).length;
  const total = required.length + recommended.length;
  return {
    status: requiredMissing.length ? 'NeedsClarification' : recommendedMissing.length ? 'ReadyWithWarnings' : 'Ready',
    canApprove: requiredMissing.length === 0,
    requiredMissing,
    recommendedMissing,
    score: total ? Math.round((completed / total) * 100) : 100,
    completed,
    total,
  };
};

const evaluateRequirement = (item = {}) => finish([
  field('title', 'Tiêu đề', present(item.title)),
  field('description', 'Mô tả', present(item.description)),
  field('objective', 'Mục tiêu nghiệp vụ', present(item.objective)),
  field('actors', 'Actor / vai trò', present(item.actors)),
  field('inScope', 'Phạm vi kiểm thử', present(item.inScope)),
  field('acceptanceCriteria', 'Acceptance Criteria', present(item.acceptanceCriteria)),
], [
  field('businessRules', 'Business rule', present(item.businessRules)),
  field('risks', 'Rủi ro', present(item.risks)),
  field('testDataRequirements', 'Dữ liệu kiểm thử', present(item.testDataRequirements)),
]);

const evaluateUseCase = (item = {}) => finish([
  field('name', 'Tên Use Case', present(item.name)),
  field('actor', 'Actor', present(item.actor) && !/^cần .+ xác nhận$/i.test(String(item.actor).trim())),
  field('summary', 'Mục tiêu / tóm tắt', present(item.summary)),
  field('mainFlow', 'Main flow có ít nhất 2 bước', Array.isArray(item.mainFlow) && item.mainFlow.filter(present).length >= 2),
  field('requirements', 'Requirement nguồn', present(item.requirements)),
], [
  field('trigger', 'Trigger', present(item.trigger)),
  field('preconditions', 'Precondition', present(item.preconditions)),
  field('postconditions', 'Postcondition', present(item.postconditions)),
  field('alternateFlows', 'Luồng thay thế', present(item.alternateFlows) || present(item.exceptionFlows)),
]);

const evaluateUserStory = (item = {}) => finish([
  field('title', 'Tiêu đề', present(item.title)),
  field('description', 'Mô tả As a / I want / so that', present(item.description)),
  field('acceptanceCriteria', 'Acceptance Criteria', Array.isArray(item.acceptanceCriteria) && item.acceptanceCriteria.some((entry) => present(criteriaText(entry)))),
], [
  field('businessValue', 'Giá trị nghiệp vụ', present(item.businessValue)),
  field('inScope', 'Phạm vi', present(item.inScope)),
  field('definitionOfDone', 'Definition of Done', present(item.definitionOfDone) || present(item.e2e?.definitionOfDone)),
  field('traceability', 'Liên kết Requirement hoặc Use Case', present(item.parentRequirements) || present(item.e2e?.requirements) || present(item.e2e?.useCase)),
]);

const evaluateTestPlan = (item = {}) => {
  const sourceReady = item.kind === 'ExecutionPlan' ? present(item.testCases) : present(item.userStories);
  return finish([
    field('name', 'Tên Test Plan', present(item.name)),
    field('scope', 'Phạm vi', present(item.scope)),
    field('objectives', 'Mục tiêu kiểm thử', present(item.objectives)),
    field('testStrategy', 'Chiến lược kiểm thử', present(item.testStrategy)),
    field('entryCriteria', 'Entry criteria', present(item.entryCriteria)),
    field('exitCriteria', 'Exit criteria', present(item.exitCriteria)),
    field('environment', 'Môi trường', present(item.environment)),
    field(item.kind === 'ExecutionPlan' ? 'testCases' : 'userStories', item.kind === 'ExecutionPlan' ? 'Test Case nguồn' : 'User Story nguồn', sourceReady),
  ], [
    field('testItems', 'Test items', present(item.testItems)),
    field('risks', 'Rủi ro và phương án xử lý', present(item.risks)),
    field('deliverables', 'Deliverables', present(item.deliverables)),
  ]);
};

const evaluateTestSuite = (item = {}) => finish([
  field('name', 'Tên Test Suite', present(item.name)),
  field('description', 'Mô tả phạm vi nhóm', present(item.description)),
  field('systemProfile', 'System Profile', item.origin !== 'SystemE2E' || present(item.systemProfile)),
]);

const evaluateTestCase = (item = {}) => {
  const steps = Array.isArray(item.testSteps) ? item.testSteps : [];
  return finish([
    field('title', 'Tiêu đề', present(item.title)),
    field('objective', 'Mục tiêu kiểm thử', present(item.objective)),
    field('testSuite', 'Test Suite', present(item.testSuite)),
    field('testSteps', 'Test step', steps.length > 0),
    field('expectedResults', 'Action và Expected Result của mọi bước', steps.length > 0 && steps.every(stepIsComplete)),
  ], [
    field('preconditions', 'Precondition', present(item.preconditions)),
    field('storyCoverage', 'Truy vết Acceptance Criteria', present(item.storyCoverage)),
    field('estimatedTime', 'Thời gian ước tính', Number(item.estimatedTime) > 0),
    field('testData', 'Dữ liệu kiểm thử', present(item.generatedTestData) || steps.some((step) => present(step.testData))),
  ]);
};

const evaluators = {
  Requirement: evaluateRequirement,
  UseCase: evaluateUseCase,
  UserStory: evaluateUserStory,
  TestPlan: evaluateTestPlan,
  TestSuite: evaluateTestSuite,
  TestCase: evaluateTestCase,
};

const evaluateDocument = (type, item) => {
  const evaluator = evaluators[type];
  if (!evaluator) throw new Error(`Không hỗ trợ Quality Gate cho ${type}.`);
  return { documentType: type, ...evaluator(item) };
};

const qualityErrorDetails = (quality) => ({
  quality,
  missingFields: quality.requiredMissing.map((item) => item.label),
});

module.exports = {
  evaluateDocument,
  evaluateRequirement,
  evaluateUseCase,
  evaluateUserStory,
  evaluateTestPlan,
  evaluateTestSuite,
  evaluateTestCase,
  qualityErrorDetails,
};
