const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  evaluateRequirement, evaluateUseCase, evaluateUserStory,
  evaluateTestPlan, evaluateTestSuite, evaluateTestCase,
} = require('../../services/documentQualityService');

test('all document types use the same quality-gate result shape', () => {
  const results = [
    evaluateRequirement({}), evaluateUseCase({}), evaluateUserStory({}),
    evaluateTestPlan({}), evaluateTestSuite({}), evaluateTestCase({}),
  ];
  for (const quality of results) {
    assert.equal(quality.status, 'NeedsClarification');
    assert.equal(quality.canApprove, false);
    assert.ok(quality.requiredMissing.length > 0);
    assert.equal(typeof quality.score, 'number');
  }
});

test('complete core content is approvable while optional gaps remain warnings', () => {
  const requirement = evaluateRequirement({ title: 'Đặt hàng', description: 'Tạo đơn', objective: 'Mua hàng', actors: ['Customer'], inScope: ['Checkout'], acceptanceCriteria: ['Given giỏ hợp lệ When xác nhận Then tạo đơn'] });
  const useCase = evaluateUseCase({ code: 'UC-01', name: 'Đặt hàng', actor: 'Customer', summary: 'Tạo đơn', risk: 'High', trigger: 'Khách xác nhận giỏ hàng', preconditions: ['Giỏ hàng hợp lệ'], mainFlow: ['A: Xác nhận', 'S: Tạo đơn'], postconditions: ['Đơn hàng được tạo'], alternateFlows: ['Giỏ không hợp lệ thì từ chối'] });
  const story = evaluateUserStory({ title: 'Đặt hàng', description: 'As a customer...', acceptanceCriteria: [{ criteria: 'Given ... When ... Then ...' }] });
  const plan = evaluateTestPlan({ kind: 'TestPlan', name: 'Checkout', scope: 'Checkout', objectives: ['Xác nhận'], testStrategy: 'Risk based', entryCriteria: ['Ready'], exitCriteria: ['Passed'], environmentRequirements: 'Môi trường đáp ứng preconditions', testLevels: ['System'], testTypes: ['Functional'], coverageTargets: ['Business rule', 'Product risk'], userStories: ['s1'] });
  const suite = evaluateTestSuite({ name: 'Checkout', description: 'Nhóm checkout', origin: 'SystemE2E', systemProfile: 'p1' });
  const testCase = evaluateTestCase({ title: 'Đặt hàng thành công', objective: 'Xác nhận tạo đơn', testSuite: 'suite1', userStory: 'story1', environmentRequirement: 'Môi trường đáp ứng preconditions', generatedTestData: { cart: 'valid' }, testSteps: [{ action: 'Xác nhận', expectedResult: 'Đơn được tạo' }] });

  for (const quality of [requirement, useCase, story, plan, suite, testCase]) {
    assert.equal(quality.canApprove, true);
    assert.ok(['Ready', 'ReadyWithWarnings'].includes(quality.status));
  }
});

test('Use Case cannot be approved without the standard specification fields', () => {
  const quality = evaluateUseCase({ code: 'UC-01', name: 'Đặt hàng', actor: 'Customer', summary: 'Tạo đơn', risk: 'High', mainFlow: ['A: Xác nhận', 'S: Tạo đơn'] });
  assert.equal(quality.canApprove, false);
  assert.deepEqual(quality.requiredMissing.map((item) => item.key), ['trigger', 'preconditions', 'postconditions']);
});

test('the system under design cannot be used as its own Use Case actor', () => {
  const quality = evaluateUseCase({ code: 'UC-01', name: 'Bảo vệ dữ liệu', actor: 'Hệ thống', summary: 'Kiểm soát truy cập', risk: 'Critical', trigger: 'Có yêu cầu truy cập', preconditions: ['Tài khoản tồn tại'], mainFlow: ['A: Yêu cầu truy cập', 'S: Kiểm tra quyền'], postconditions: ['Quyền được kiểm tra'] });
  assert.equal(quality.canApprove, false);
  assert.ok(quality.requiredMissing.some((item) => item.key === 'actor'));
});

test('an independent Use Case does not require a parent Requirement or secondary actor', () => {
  const quality = evaluateUseCase({ code: 'UC-01', name: 'Đặt hàng', actor: 'Customer', summary: 'Tạo đơn', risk: 'High', trigger: 'Khách xác nhận', preconditions: ['Giỏ hợp lệ'], mainFlow: ['A: Xác nhận', 'S: Tạo đơn'], postconditions: ['Đơn được tạo'], exceptionFlows: ['Thanh toán lỗi thì giữ giỏ'] });
  assert.equal(quality.canApprove, true);
  assert.equal(quality.status, 'Ready');
  assert.equal(quality.score, 100);
});

test('test case rejects a step without an expected result', () => {
  const quality = evaluateTestCase({ title: 'Checkout', objective: 'Kiểm tra', testSuite: 'suite1', testSteps: [{ action: 'Bấm xác nhận', expectedResult: '' }] });
  assert.equal(quality.canApprove, false);
  assert.ok(quality.requiredMissing.some((item) => item.key === 'expectedResults'));
});

test('test case cannot be approved without traceability', () => {
  const quality = evaluateTestCase({ title: 'Checkout', objective: 'Kiểm tra', testSuite: 'suite1', testSteps: [{ action: 'Bấm xác nhận', expectedResult: 'Tạo đơn' }] });
  assert.equal(quality.canApprove, false);
  assert.ok(quality.requiredMissing.some((item) => item.key === 'traceability'));
});
