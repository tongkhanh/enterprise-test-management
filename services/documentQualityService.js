const present = (value) => {
  if (Array.isArray(value)) return value.some((item) => present(item));
  if (value && typeof value === 'object') return Object.keys(value).length > 0;
  return value !== null && value !== undefined && String(value).trim() !== '';
};

const criteriaText = (item) => typeof item === 'string' ? item : item?.criteria;
const stepIsComplete = (step) => present(step?.action) && present(step?.expectedResult);
const clarified = (value) => present(value) && !/(cần\s+(?:qa|po|ba).+xác nhận|chưa.+(?:nguồn|requirement)|không.+được nêu)/i.test(Array.isArray(value) ? value.join(' ') : String(value));
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
  field('code', 'ID / mã Use Case', present(item.code)),
  field('name', 'Tên Use Case', present(item.name)),
  field('actor', 'Actor bên ngoài hệ thống', present(item.actor) && !/^(?:cần .+ xác nhận|hệ\s*thống|system|app(?:lication)?|website)$/i.test(String(item.actor).trim())),
  field('summary', 'Mục tiêu / tóm tắt', present(item.summary)),
  field('risk', 'Mức độ ưu tiên', ['Critical', 'High', 'Medium', 'Low'].includes(item.risk)),
  field('trigger', 'Trigger / điều kiện kích hoạt', clarified(item.trigger)),
  field('preconditions', 'Pre-condition / tiền điều kiện', clarified(item.preconditions)),
  field('mainFlow', 'Main flow có ít nhất 2 bước', Array.isArray(item.mainFlow) && item.mainFlow.filter(present).length >= 2),
  field('postconditions', 'Post-condition / hậu điều kiện', clarified(item.postconditions)),
], [
  // Use Case, Requirement và User Story là các Test Basis ngang hàng. Một Use
  // Case nguồn không bắt buộc phải có Requirement cha hoặc actor phụ. Luồng
  // thay thế / ngoại lệ cũng chỉ được yêu cầu khi nghiệp vụ thực sự có nhánh.
  field('alternateOrExceptionFlows', 'Luồng thay thế hoặc ngoại lệ', clarified(item.alternateFlows) || clarified(item.exceptionFlows)),
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
  const sourceReady = item.kind === 'ExecutionPlan'
    ? present(item.testCases)
    : present(item.requirements) || present(item.userStories) || present(item.useCases);
  const comprehensive = present(item.documentControl?.documentId) || present(item.introduction?.purpose) || present(item.systemUnderTest?.name) || present(item.traceabilityMatrix);
  return finish([
    field('documentId', 'Document ID', !comprehensive || present(item.documentControl?.documentId) || item.kind === 'ExecutionPlan'),
    field('name', 'Tên Test Plan', present(item.name)),
    field('version', 'Phiên bản tài liệu', !comprehensive || present(item.documentControl?.version) || item.kind === 'ExecutionPlan'),
    field('purpose', 'Mục đích tài liệu', !comprehensive || present(item.introduction?.purpose) || item.kind === 'ExecutionPlan'),
    field('background', 'Bối cảnh hệ thống', !comprehensive || present(item.introduction?.background) || item.kind === 'ExecutionPlan'),
    field('systemUnderTest', 'Hệ thống dưới kiểm thử', !comprehensive || present(item.systemUnderTest?.name) || item.kind === 'ExecutionPlan'),
    field('scope', 'Phạm vi', present(item.scope)),
    field('objectives', 'Mục tiêu kiểm thử', present(item.objectives)),
    field('testStrategy', 'Chiến lược kiểm thử', present(item.testStrategy)),
    field('entryCriteria', 'Entry criteria', present(item.entryCriteria)),
    field('exitCriteria', 'Exit criteria', present(item.exitCriteria)),
    field('testLevels', 'Test level', present(item.testLevels)),
    field('testTypes', 'Test type', present(item.testTypes)),
    field('coverageTargets', 'Mục tiêu coverage', present(item.coverageTargets)),
    field('environmentRequirements', 'Yêu cầu môi trường', present(item.environmentRequirements) || present(item.environment)),
    field('testDataRequirements', 'Yêu cầu dữ liệu kiểm thử', !comprehensive || present(item.testDataRequirements) || item.kind === 'ExecutionPlan'),
    field('passFailCriteria', 'Tiêu chí Pass/Fail và hoàn tất chu kỳ', !comprehensive || item.kind === 'ExecutionPlan' || (present(item.passFailCriteria?.testCasePass) && present(item.passFailCriteria?.testCaseFail) && present(item.passFailCriteria?.testCycleCompletion))),
    field('defectWorkflow', 'Quy trình quản lý defect', !comprehensive || present(item.defectManagement?.workflow) || item.kind === 'ExecutionPlan'),
    field('rolesResponsibilities', 'Vai trò và trách nhiệm', !comprehensive || present(item.rolesResponsibilities) || item.kind === 'ExecutionPlan'),
    field('traceabilityMatrix', 'Ma trận truy vết', !comprehensive || present(item.traceabilityMatrix) || item.kind === 'ExecutionPlan'),
    field(item.kind === 'ExecutionPlan' ? 'testCases' : 'testBasis', item.kind === 'ExecutionPlan' ? 'Test Case nguồn' : 'Test basis (Requirement, User Story hoặc Use Case)', sourceReady),
  ], [
    field('testItems', 'Test items', present(item.testItems)),
    field('risks', 'Rủi ro và phương án xử lý', present(item.risks)),
    field('deliverables', 'Deliverables', present(item.deliverables)),
    field('estimatedEffortHours', 'Ước tính nguồn lực', Number(item.estimatedEffortHours) > 0),
    field('schedule', 'Lịch dự kiến', !item.planningContext?.scheduleRequired || (present(item.startDate) && present(item.endDate))),
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
    field('traceability', 'Liên kết Requirement, User Story, Use Case hoặc Acceptance Criteria', present(item.storyCoverage) || present(item.userStory) || present(item.e2e?.requirements) || present(item.e2e?.useCase)),
    field('environmentRequirement', 'Yêu cầu môi trường', present(item.environmentRequirement) || present(item.generationContext?.environmentSnapshot)),
    field('testData', 'Dữ liệu kiểm thử', present(item.generatedTestData) || steps.some((step) => present(step.testData))),
  ], [
    field('preconditions', 'Precondition', present(item.preconditions)),
    field('postconditions', 'Postcondition / cleanup', present(item.postconditions) || present(item.e2e?.cleanup)),
    field('productRisks', 'Product risk', present(item.productRisks)),
    field('evidence', 'Evidence / nguồn căn cứ', present(item.evidence)),
    field('estimatedTime', 'Thời gian ước tính', Number(item.estimatedTime) > 0),
    field('sourceReview', 'Rà soát bản nháp nguồn và thay dữ liệu placeholder',
      !(item.tags || []).includes('NeedsSpecificationReview') &&
      !/(accountReference|alternateCondition|protectedAction|restrictedRole|dữ liệu hợp lệ đại diện)/i.test(JSON.stringify(item.generatedTestData || {}))),
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
