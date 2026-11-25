const test = require('node:test');
const assert = require('node:assert/strict');
const { reviewGaps } = require('../../services/executionReviewService');

test('runner results require a separate QA verdict for the current attempt', () => {
  const execution = { _id: 'case', result: 'Passed', automationRun: 'attempt-2' };
  assert.equal(reviewGaps([execution])[0].reason, 'QAConfirmationRequired');
  execution.qaVerdict = 'Passed'; execution.qaReviewedAt = new Date(); execution.qaAutomationRun = 'attempt-1';
  assert.equal(reviewGaps([execution])[0].reason, 'QAConfirmationRequired');
  execution.qaAutomationRun = 'attempt-2';
  assert.deepEqual(reviewGaps([execution]), []);
});

test('Fail and Blocked require human triage; Pending AI alone does not qualify', () => {
  for (const result of ['Failed', 'Blocked']) {
    const execution = { _id: 'case', result, qaVerdict: result, qaReviewedAt: new Date(), automationRun: 'attempt-2', qaAutomationRun: 'attempt-2', triage: { aiSuggestion: { status: 'Pending' } } };
    assert.equal(reviewGaps([execution])[0].reason, 'TriageRequired');
    execution.triage = { classification: 'Environment', reviewedAt: new Date(), automationRun: 'attempt-1' };
    assert.equal(reviewGaps([execution])[0].reason, 'TriageRequired');
    execution.triage.automationRun = 'attempt-2';
    assert.deepEqual(reviewGaps([execution]), []);
  }
});

test('manual Pass and Skipped can finish with QA confirmation without invented root causes', () => {
  for (const result of ['Passed', 'Skipped']) {
    assert.deepEqual(reviewGaps([{ result, qaVerdict: result, qaReviewedAt: new Date() }]), []);
  }
});
