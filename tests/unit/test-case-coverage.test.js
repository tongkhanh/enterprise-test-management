const test = require('node:test');
const assert = require('node:assert/strict');
const { enforceGeneratedCoverage } = require('../../controllers/e2eController');

const row = (title, coverage) => ({
  title,
  objective: title,
  storyCoverage: coverage,
  testSteps: [{ action: `Thực hiện ${title}`, expectedResult: `Hoàn tất ${title}` }],
});

test('coverage gate adds draft cases for every uncovered Acceptance Criteria', () => {
  const criteria = [
    'Hiển thị danh sách đơn hàng của khách hàng.',
    'Từ chối mã giảm giá đã hết hạn.',
    'Giới hạn số lượng món tối đa là 20.',
  ];
  const result = enforceGeneratedCoverage({
    rows: [row('Danh sách đơn hàng', [criteria[0]])],
    criteria,
    useCase: { name: 'Đặt món', risk: 'High', preconditions: ['Đã đăng nhập'] },
  });
  assert.equal(result.report.criteria, 3);
  assert.equal(result.report.covered, 3);
  assert.equal(result.report.missing.length, 0);
  assert.equal(result.report.addedCases, 2);
  assert.ok(result.rows.some((item) => item.journeyType === 'Negative'));
  assert.ok(result.rows.some((item) => item.journeyType === 'Boundary'));
  for (const criterion of criteria) assert.ok(result.rows.some((item) => (item.storyCoverage || []).includes(criterion)));
});

test('coverage gate removes duplicate generated cases without inventing extra scope', () => {
  const criterion = 'Khách hàng nhận được mã đơn sau khi đặt món thành công.';
  const duplicate = row('Đặt món thành công', [criterion]);
  const result = enforceGeneratedCoverage({ rows: [duplicate, { ...duplicate }], criteria: [criterion], useCase: { name: 'Đặt món' } });
  assert.equal(result.rows.length, 1);
  assert.equal(result.report.duplicateCasesRemoved, 1);
  assert.equal(result.report.addedCases, 0);
  assert.deepEqual(result.report.missing, []);
});

test('coverage gate does not force a fixed number when the source has no Acceptance Criteria', () => {
  const result = enforceGeneratedCoverage({ rows: [row('Luồng chính', [])], criteria: [], useCase: { name: 'Tra cứu' } });
  assert.equal(result.rows.length, 1);
  assert.equal(result.report.criteria, 0);
  assert.equal(result.report.addedCases, 0);
});
