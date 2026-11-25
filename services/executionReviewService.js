const verdicts = new Set(['Passed', 'Failed', 'Blocked', 'Skipped']);
const id = (value) => String(value?._id || value || '');
function hasCurrentQaReview(execution) {
  return Boolean(verdicts.has(execution.qaVerdict) && execution.qaReviewedAt &&
    execution.result === execution.qaVerdict && id(execution.qaAutomationRun) === id(execution.automationRun));
}
function hasCurrentTriage(execution) {
  return Boolean(execution.triage?.reviewedAt && execution.triage.classification && execution.triage.classification !== 'Untriaged' &&
    id(execution.triage.automationRun) === id(execution.automationRun));
}
function reviewGaps(executions) {
  return executions.flatMap((execution) => {
    if (!hasCurrentQaReview(execution)) return [{ execution: id(execution), reason: 'QAConfirmationRequired' }];
    if (['Failed', 'Blocked'].includes(execution.qaVerdict) && !hasCurrentTriage(execution)) return [{ execution: id(execution), reason: 'TriageRequired' }];
    return [];
  });
}
module.exports = { hasCurrentQaReview, hasCurrentTriage, reviewGaps, verdicts };
