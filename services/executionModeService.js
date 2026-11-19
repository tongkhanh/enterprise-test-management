const AUTOMATION_STATES = Object.freeze({
  READY: 'Ready',
  STALE: 'Stale',
  REVIEW_REQUIRED: 'ReviewRequired',
  SCRIPT_REQUIRED: 'ScriptRequired',
  NOT_SUITABLE: 'NotSuitable',
});

const newestFirst = (left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0);

const deriveExecutionReadiness = (testCase, scripts = []) => {
  const profile = testCase?.executionProfile || {};
  const manualSupported = profile.manualSupported !== false;
  const legacyAutomated = testCase?.type === 'Automated';
  const automationSuitability = profile.automationSuitability
    || (testCase?.automationCandidate?.eligible || legacyAutomated ? 'Candidate' : 'NotAssessed');
  const recommendedMode = profile.recommendedMode || (legacyAutomated ? 'Automation' : 'Manual');
  const sorted = [...scripts].sort(newestFirst);
  const caseUpdatedAt = new Date(testCase?.updatedAt || 0).getTime();
  const approved = sorted.filter((script) => script.status === 'Approved');
  const readyScript = approved.find((script) => {
    const sourceTime = new Date(script.sourceCaseUpdatedAt || 0).getTime();
    return sourceTime > 0 && sourceTime >= caseUpdatedAt;
  });
  const latest = sorted[0] || null;

  let automationState = AUTOMATION_STATES.SCRIPT_REQUIRED;
  let reason = 'Chưa có Automation Script đã được validate và phê duyệt.';
  if (readyScript) {
    automationState = AUTOMATION_STATES.READY;
    reason = 'Đã có Automation Script được phê duyệt và còn đồng bộ với Test Case.';
  } else if (approved.length) {
    automationState = AUTOMATION_STATES.STALE;
    reason = 'Automation Script đã cũ so với phiên bản Test Case hiện tại.';
  } else if (latest && latest.status === 'Validated') {
    automationState = AUTOMATION_STATES.REVIEW_REQUIRED;
    reason = 'Automation Script đã validate nhưng chưa được phê duyệt.';
  } else if (automationSuitability === 'NotSuitable') {
    automationState = AUTOMATION_STATES.NOT_SUITABLE;
    reason = profile.recommendationReason || 'Test Case được đánh giá không phù hợp để tự động hóa.';
  }

  return {
    manualSupported,
    automationSuitability,
    recommendedMode,
    recommendationReason: profile.recommendationReason || testCase?.automationCandidate?.reason || '',
    preferredEngine: profile.preferredEngine || '',
    automationState,
    automationReady: automationState === AUTOMATION_STATES.READY,
    automationReason: reason,
    automationScript: readyScript?._id || null,
    latestScriptStatus: latest?.status || null,
  };
};

const assignExecutionModes = ({ items, executionMode = 'Mixed', caseModes = [] }) => {
  const requestedMode = ['Manual', 'Automation', 'Mixed'].includes(executionMode) ? executionMode : 'Mixed';
  const overrides = new Map(caseModes.map((entry) => [String(entry.boardItemId), entry.mode]));
  const groups = { Manual: [], Automation: [] };
  const blocked = [];

  items.forEach((item) => {
    const override = overrides.get(String(item.boardItemId));
    let mode = override;
    if (!['Manual', 'Automation'].includes(mode)) {
      if (requestedMode === 'Mixed') mode = item.readiness.automationReady ? 'Automation' : 'Manual';
      else mode = requestedMode;
    }
    if (mode === 'Manual' && !item.readiness.manualSupported) {
      blocked.push({ boardItemId: item.boardItemId, mode, reason: 'Test Case không hỗ trợ thực thi Manual.' });
    } else if (mode === 'Automation' && !item.readiness.automationReady) {
      blocked.push({ boardItemId: item.boardItemId, mode, reason: item.readiness.automationReason });
    } else groups[mode].push(item);
  });

  return { requestedMode, groups, blocked };
};

module.exports = { AUTOMATION_STATES, deriveExecutionReadiness, assignExecutionModes };
