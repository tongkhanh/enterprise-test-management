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
  const useCase = evaluateUseCase({ name: 'Đặt hàng', actor: 'Customer', summary: 'Tạo đơn', mainFlow: ['A: Xác nhận', 'S: Tạo đơn'], requirements: ['r1'] });
  const story = evaluateUserStory({ title: 'Đặt hàng', description: 'As a customer...', acceptanceCriteria: [{ criteria: 'Given ... When ... Then ...' }] });
  const plan = evaluateTestPlan({ kind: 'TestPlan', name: 'Checkout', scope: 'Checkout', objectives: ['Xác nhận'], testStrategy: 'Risk based', entryCriteria: ['Ready'], exitCriteria: ['Passed'], environment: 'Staging', userStories: ['s1'] });
  const suite = evaluateTestSuite({ name: 'Checkout', description: 'Nhóm checkout', origin: 'SystemE2E', systemProfile: 'p1' });
  const testCase = evaluateTestCase({ title: 'Đặt hàng thành công', objective: 'Xác nhận tạo đơn', testSuite: 'suite1', testSteps: [{ action: 'Xác nhận', expectedResult: 'Đơn được tạo' }] });

  for (const quality of [requirement, useCase, story, plan, suite, testCase]) {
    assert.equal(quality.canApprove, true);
    assert.ok(['Ready', 'ReadyWithWarnings'].includes(quality.status));
  }
});

test('test case rejects a step without an expected result', () => {
  const quality = evaluateTestCase({ title: 'Checkout', objective: 'Kiểm tra', testSuite: 'suite1', testSteps: [{ action: 'Bấm xác nhận', expectedResult: '' }] });
  assert.equal(quality.canApprove, false);
  assert.ok(quality.requiredMissing.some((item) => item.key === 'expectedResults'));
});
