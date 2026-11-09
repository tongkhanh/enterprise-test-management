const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mergeAcceptanceCriteria, fillMissingRequirementData } = require('../../controllers/testBasisController');

test('requirement import enriches only rows missing acceptance criteria', () => {
  const rows = [
    { requirementId: 'BR-01', acceptanceCriteria: ['Given A When B Then C'] },
    { requirementId: 'BR-02', acceptanceCriteria: [] },
    { requirementId: 'BR-03', acceptanceCriteria: [] },
  ];
  const merged = mergeAcceptanceCriteria(rows, [
    { requirementId: 'br-01', acceptanceCriteria: ['must not replace'] },
    { requirementId: 'br-02', acceptanceCriteria: ['Given X When Y Then Z'], evidenceSections: ['7.2'] },
    { requirementId: 'br-03', acceptanceCriteria: [], clarificationNeeded: 'Cần xác nhận ngưỡng thời gian đáp ứng.' },
  ]);

  assert.deepEqual(merged[0].acceptanceCriteria, ['Given A When B Then C']);
  assert.deepEqual(merged[1].acceptanceCriteria, ['Given X When Y Then Z']);
  assert.deepEqual(merged[1].evidenceSections, ['7.2']);
  assert.deepEqual(merged[2].acceptanceCriteria, []);
  assert.match(merged[2].reviewNote, /ngưỡng thời gian/);
});

test('re-import fills missing fields without overwriting reviewed content', () => {
  const item = {
    title: 'Tiêu đề đã sửa', description: '', objective: '', actors: [], inScope: ['Phạm vi đã duyệt'],
    acceptanceCriteria: [], scope: { level: 'Feature', name: '' },
  };
  fillMissingRequirementData(item, {
    title: 'Tiêu đề AI', description: 'Mô tả từ BRD', objective: 'Mục tiêu', actors: ['Customer'],
    inScope: ['Phạm vi AI'], acceptanceCriteria: ['Given hợp lệ When gửi Then tạo đơn'],
    scope: { level: 'Feature', name: 'Đặt hàng' },
  });

  assert.equal(item.title, 'Tiêu đề đã sửa');
  assert.equal(item.description, 'Mô tả từ BRD');
  assert.deepEqual(item.inScope, ['Phạm vi đã duyệt']);
  assert.deepEqual(item.acceptanceCriteria, ['Given hợp lệ When gửi Then tạo đơn']);
  assert.equal(item.scope.name, 'Đặt hàng');
});
