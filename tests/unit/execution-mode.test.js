const { deriveExecutionReadiness, assignExecutionModes } = require('../../services/executionModeService');
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

describe('execution mode service', () => {
  test('an approved current script makes automation ready without removing manual support', () => {
    const updatedAt = new Date('2026-01-02T00:00:00Z');
    const readiness = deriveExecutionReadiness({ updatedAt, type: 'Manual', executionProfile: { manualSupported: true, recommendedMode: 'Either' } }, [
      { _id: 'script-1', status: 'Approved', sourceCaseUpdatedAt: updatedAt, createdAt: updatedAt },
    ]);
    assert.equal(readiness.manualSupported, true);
    assert.equal(readiness.automationReady, true);
    assert.equal(readiness.automationScript, 'script-1');
  });

  test('mixed mode routes ready cases to automation and the rest to manual', () => {
    const result = assignExecutionModes({
      executionMode: 'Mixed',
      items: [
        { boardItemId: 'a', readiness: { manualSupported: true, automationReady: true } },
        { boardItemId: 'b', readiness: { manualSupported: true, automationReady: false, automationReason: 'Thiếu script' } },
      ],
    });
    assert.equal(result.blocked.length, 0);
    assert.deepEqual(result.groups.Automation.map((item) => item.boardItemId), ['a']);
    assert.deepEqual(result.groups.Manual.map((item) => item.boardItemId), ['b']);
  });

  test('explicit automation override is blocked when evidence is not ready', () => {
    const result = assignExecutionModes({
      executionMode: 'Manual',
      caseModes: [{ boardItemId: 'a', mode: 'Automation' }],
      items: [{ boardItemId: 'a', readiness: { manualSupported: true, automationReady: false, automationReason: 'Script chưa duyệt' } }],
    });
    assert.deepEqual(result.blocked, [{ boardItemId: 'a', mode: 'Automation', reason: 'Script chưa duyệt' }]);
  });
});
