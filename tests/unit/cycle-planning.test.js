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
test('source scope requires at least one explicit case, profile, or test-basis link', () => {
  assert.throws(() => planning.caseScope({}), /chưa liên kết/);
  assert.deepEqual(planning.caseScope({ testCases: ['a'] }), { _id: { $in: ['a'] } });
  assert.deepEqual(planning.caseScope({ systemProfile: 'p' }), { 'e2e.systemProfile': 'p' });
});
test('source scope merges explicit cases with Requirement, Use Case, User Story, and Profile traceability', () => {
  const scope = planning.caseScope({ _id: 'plan', systemProfile: 'profile', testCases: ['tc'], requirements: ['req'], userStories: ['story'], useCases: ['use-case'] });
  assert.ok(Array.isArray(scope.$or));
  assert.deepEqual(scope.$or[0], { _id: { $in: ['tc'] } });
  assert.ok(scope.$or.some((branch) => branch['e2e.testPlan'] === 'plan'));
  assert.ok(scope.$or.some((branch) => branch['e2e.systemProfile'] === 'profile'));
  assert.ok(scope.$or.some((branch) => branch.linkedRequirements?.$in.includes('req')));
  assert.ok(scope.$or.some((branch) => branch.linkedUserStories?.$in.includes('story')));
  assert.ok(scope.$or.some((branch) => branch.linkedUseCases?.$in.includes('use-case')));
});
test('planning limits reject zero, nonfinite, and fractional case counts', () => {
  for (const body of [{ capacityMinutes: 0 }, { capacityMinutes: Infinity }, { maxCases: -1 }, { maxCases: 1.5 }]) assert.throws(() => planning.limits(body, {}), /Nhập thời gian/);
  assert.equal(planning.limits({ capacityMinutes: 60, maxCases: 0 }, {}).maxCases, 0);
});
test('roadmap calculates the minimum Cycle count and assigns every estimated case once', () => {
  const result = planning.buildRoadmap([item('critical', 'Critical', 40), item('high', 'High', 40), item('low', 'Low', 20)], { capacityMinutes: 60, maxCases: 2, cycleCount: 0 });
  assert.equal(result.summary.minimumCycles, 2);
  assert.equal(result.cycles.length, 2);
  const assigned = result.cycles.flatMap((cycle) => cycle.assignments.map((row) => row.boardItemId));
  assert.deepEqual([...assigned].sort(), ['critical', 'high', 'low']);
  assert.equal(new Set(assigned).size, assigned.length);
  assert.ok(result.cycles.every((cycle) => cycle.estimatedMinutes <= cycle.capacityMinutes));
});
test('roadmap honors an explicit Cycle count and spreads work across requested Cycles', () => {
  const result = planning.buildRoadmap([item('a'), item('b'), item('c'), item('d')], { capacityMinutes: 60, maxCases: 10, cycleCount: 3 });
  assert.equal(result.cycles.length, 3);
  assert.deepEqual(result.cycles.map((cycle) => cycle.assignments.length), [2, 1, 1]);
});
test('roadmap keeps the requested Cycle count when capacity is insufficient and reports remaining cases', () => {
  const result = planning.buildRoadmap([item('a', 'High', 40), item('b', 'High', 40), item('c', 'High', 40)], { capacityMinutes: 60, maxCases: 10, cycleCount: 2 });
  assert.equal(result.cycles.length, 2);
  assert.equal(result.unassigned.length, 1);
});
test('roadmap keeps unknown estimates visible but unassigned instead of inventing effort', () => {
  const result = planning.buildRoadmap([item('ready', 'High', 15), item('unknown', 'Critical', 0)], { capacityMinutes: 60, maxCases: 10 });
  assert.equal(result.summary.missingEstimates, 1);
  assert.deepEqual(result.unassigned, [{ boardItemId: 'unknown', reason: 'Thiếu thời gian ước tính.' }]);
});
test('roadmap has no arbitrary Test Case count limit when maxCases is omitted', () => {
  const cases = Array.from({ length: 25 }, (_, index) => item(`case-${index + 1}`, 'Medium', 2));
  const result = planning.buildRoadmap(cases, { capacityMinutes: 60, maxCases: 0 });
  assert.equal(result.cycles.length, 1);
  assert.equal(result.cycles[0].assignments.length, 25);
  assert.equal(result.unassigned.length, 0);
});

test('cycle identity detects the same normalized name and date range', () => {
  const first = planning.cycleSignature({ name: ' Test  Cycle 1 ', startDate: '2026-11-19', endDate: '2026-11-25' });
  const duplicate = planning.cycleSignature({ name: 'test cycle 1', startDate: new Date('2026-11-19T00:00:00.000Z'), endDate: new Date('2026-11-25T00:00:00.000Z') });
  const anotherWeek = planning.cycleSignature({ name: 'Test Cycle 1', startDate: '2026-11-26', endDate: '2026-12-02' });
  assert.equal(first, duplicate);
  assert.notEqual(first, anotherWeek);
});

test('roadmap keeps one semantic Test Case per Test Basis and explains duplicates', () => {
  const duplicate = (id, basisId) => item(id, 'High', 10, { testCase: { _id: id, title: ' Đặt  món thành công ', status: 'Approved', priority: 'High', estimatedTime: 10, primaryTestBasis: { basisType: 'UseCase', basisId } } });
  const result = planning.buildRoadmap([duplicate('a', 'uc-1'), duplicate('b', 'uc-1'), duplicate('c', 'uc-2')], { capacityMinutes: 60 });
  assert.equal(result.summary.candidateCount, 3);
  assert.equal(result.summary.assignedCount, 2);
  assert.equal(result.summary.duplicateCandidates, 1);
  assert.match(result.unassigned.find((row) => row.boardItemId === 'b').reason, /Trùng Test Basis/);
  assert.deepEqual(result.cycles[0].assignments.map((row) => row.boardItemId), ['a', 'c']);
});

test('manual roadmap validation rejects semantic duplicates', () => {
  const duplicate = (id) => item(id, 'High', 10, { testCase: { _id: id, title: 'Checkout hợp lệ', status: 'Approved', priority: 'High', estimatedTime: 10, primaryTestBasis: { basisType: 'UseCase', basisId: 'uc-1' } } });
  assert.throws(() => planning.validateAssignment([duplicate('a'), duplicate('b')], ['a', 'b'], [], { maxCases: 0, capacityMinutes: 60 }), /trùng cùng Test Basis/);
});
