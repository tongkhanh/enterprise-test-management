const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDeliveryCycleWindows } = require('../../services/deliveryCycleService');

test('buildDeliveryCycleWindows creates non-overlapping recurring delivery cycles', () => {
  const windows = buildDeliveryCycleWindows({ anchorDate: '2026-11-23', durationWeeks: 2, cooldownDays: 1, count: 3, startSequence: 4 });
  assert.equal(windows.length, 3);
  assert.deepEqual(windows.map((item) => item.sequence), [4, 5, 6]);
  assert.deepEqual(windows.map((item) => item.name), ['Cycle 4', 'Cycle 5', 'Cycle 6']);
  assert.ok(windows[1].startDate > windows[0].endDate);
  assert.equal(Math.round((windows[1].startDate - windows[0].startDate) / 86400000), 15);
});

test('buildDeliveryCycleWindows rejects invalid duration', () => {
  assert.throws(() => buildDeliveryCycleWindows({ anchorDate: '2026-11-23', durationWeeks: 0, count: 1 }), /không hợp lệ/);
});
