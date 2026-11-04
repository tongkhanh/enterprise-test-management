const test = require('node:test');
const assert = require('node:assert/strict');
const planning = require('../../services/cyclePlanningService');
const item = (id, priority = 'Medium', estimate = 10, extra = {}) => ({ _id: id, status: 'Backlog', cycle: null, reviewState: 'Approved', testCase: { title: id, status: 'Approved', priority, estimatedTime: estimate }, ...extra });

test('weekly selection uses remaining whole-cycle capacity and prioritizes risk', () => {
  const result = planning.choose([item('low', 'Low'), item('critical', 'Critical'), item('high', 'High')], { total: 1, estimatedMinutes: 10 }, { maxCases: 3, capacityMinutes: 30 });
  assert.deepEqual(result.map((row) => row.boardItemId), ['critical', 'high']);
});
test('already assigned, unreviewed, and unknown estimates are excluded', () => {
  const result = planning.choose([item('assigned', 'Critical', 5, { cycle: 'c2' }), item('review', 'High', 5, { reviewState: 'NeedsReview' }), item('unknown', 'High', 0), item('good')], { total: 0, estimatedMinutes: 0 }, { maxCases: 10, capacityMinutes: 60 });
  assert.deepEqual(result.map((row) => row.boardItemId), ['good']);
});
test('AI rank cannot introduce nonexistent IDs or exceed the budget', () => {
  const result = planning.choose([item('a'), item('b')], { total: 0, estimatedMinutes: 0 }, { maxCases: 1, capacityMinutes: 10 }, [{ boardItemId: 'invented' }, { boardItemId: 'b', reason: 'Prioritize permission' }]);
  assert.deepEqual(result.map((row) => row.boardItemId), ['b']);
});
test('reapplying or moving another Cycle case fails instead of duplicating it', () => {
  assert.throws(() => planning.validateAssignment([item('a', 'High', 10, { cycle: 'other', status: 'Todo' })], ['a'], [], { maxCases: 10, capacityMinutes: 60 }), /Cycle khác/);
  assert.throws(() => planning.validateAssignment([item('a')], ['outside'], [], { maxCases: 10, capacityMinutes: 60 }), /Test Plan/);
  assert.throws(() => planning.validateAssignment([item('a')], ['a', 'a'], [], { maxCases: 10, capacityMinutes: 60 }), /trùng/);
});
test('apply revalidates current approval, existing work, and unknown estimates', () => {
  const budget = { maxCases: 2, capacityMinutes: 20 };
  assert.throws(() => planning.validateAssignment([item('a', 'High', 10, { reviewState: 'NeedsReview' })], ['a'], [], budget), /đổi trạng thái/);
  assert.throws(() => planning.validateAssignment([item('a', 'High', 15)], ['a'], [item('existing')], budget), /vượt/);
  assert.throws(() => planning.validateAssignment([item('a', 'High', 0)], ['a'], [], budget), /ước tính/);
});
test('cycle summaries reflect Board status and estimates without copying status elsewhere', () => {
  const result = planning.summarize([item('a', 'High', 10, { status: 'InProgress' }), item('b', 'Medium', 5, { status: 'Done' })]);
  assert.equal(result.total, 2); assert.equal(result.estimatedMinutes, 15); assert.equal(result.byStatus.InProgress, 1); assert.equal(result.byStatus.Done, 1);
});
test('source scope requires explicit plan cases or profile and story linkage', () => {
  assert.throws(() => planning.caseScope({}), /chưa liên kết/);
  assert.deepEqual(planning.caseScope({ testCases: ['a'] }), { _id: { $in: ['a'] } });
  assert.deepEqual(planning.caseScope({ systemProfile: 'p', userStories: ['s'] }), { 'e2e.systemProfile': 'p', userStory: { $in: ['s'] } });
});
test('planning limits reject zero, nonfinite, and fractional case counts', () => {
  for (const body of [{ capacityMinutes: 0 }, { capacityMinutes: Infinity }, { maxCases: 1.5 }]) assert.throws(() => planning.limits(body, {}), /Nhập thời gian/);
});
