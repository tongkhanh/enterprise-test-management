const { TestReport, TestRun, TestExecution, AutomationResult, Bug } = require('../models');
const { AppError } = require('../utils/http');
const ai = require('./aiService');
const { exportArtifact } = require('./artifactExportService');
const { resolveCaseRuntime } = require('./e2eRuntimeService');
const { randomUUID } = require('node:crypto');

const safe = (value) => String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, 20000);
const redact = (value) => safe(value)
  .replace(/(api[_-]?key|token|secret|password|passwd|authorization)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
  .replace(/\b(?:ghp|github_pat|glpat|sk|AIza)[A-Za-z0-9_\-]{12,}\b/g, '[REDACTED_TOKEN]')
  .replace(/mongodb(?:\+srv)?:\/\/[^\s]+/gi, 'mongodb://[REDACTED]');

async function buildContext(testRunId) {
  const run = await TestRun.findById(testRunId).populate({ path: 'testPlan', select: 'name project scope objectives approvalStatus' }).lean();
  if (!run) throw new AppError('Test Run không tồn tại.', 404);
  if (run.testPlan?.approvalStatus && run.testPlan.approvalStatus !== 'Approved') throw new AppError('Test Plan phải được Approved trước khi tạo báo cáo.', 409);
  if (run.status !== 'Completed') throw new AppError('Test Run phải hoàn tất trước khi tạo báo cáo.', 409);
  const [executions, automation, bugs] = await Promise.all([
    TestExecution.find({ testRun: run._id })
      .populate('testCase', 'testCaseId title priority type e2e targetUrl')
      .populate('automationRun', 'result status engine targetUrl')
      .select('result duration notes actualResult testCase automationRun executedBy executedAt qaVerdict').lean(),
    AutomationResult.find({ testRun: run._id })
      .select('framework status duration failureAnalysis testCase testExecution targetUrl createdAt completedAt')
      .sort({ createdAt: 1, _id: 1 }).lean(),
    Bug.find({ project: run.testPlan.project, testExecution: { $in: await TestExecution.find({ testRun: run._id }).distinct('_id') } }).select('title severity priority status rootCause').lean(),
  ]);
  const details = await Promise.all(executions.map(async (execution) => {
    const attempts = automation.filter((result) => String(result.testExecution || '') === String(execution._id) ||
      (!result.testExecution && String(result.testCase || '') === String(execution.testCase?._id)));
    const linked = attempts.find((result) => String(result._id) === String(execution.automationRun?.result));
    const latest = linked || attempts.at(-1);
    const mode = execution.automationRun || latest ? 'Auto' : execution.executedBy || execution.executedAt ? 'Manual' : 'Unknown';
    const recordedUrl = latest?.targetUrl || execution.automationRun?.targetUrl;
    const runtime = !recordedUrl && execution.testCase ? await resolveCaseRuntime(execution.testCase) : null;
    const targetUrl = latest?.targetUrl || execution.automationRun?.targetUrl || runtime?.targetUrl || '';
    return {
      execution, mode, targetUrl,
      latestRunnerStatus: latest?.status || execution.automationRun?.status || '',
      latestFailureAnalysis: latest?.failureAnalysis,
      previousAttempts: attempts.filter((result) => result !== latest),
    };
  }));
  const urls = [...new Set(details.map((detail) => detail.targetUrl).filter(Boolean))];
  // A Profile's runtime is authoritative even when it is unavailable. Legacy runs
  // without Profiles or recorded runtime URLs retain their free-text environment.
  const hasProfile = executions.some((execution) => execution.testCase?.e2e?.systemProfile);
  const environment = urls.join('\n') || (hasProfile ? 'Chưa có môi trường Ready' : run.environment || '');
  return { run, project: run.testPlan.project, executions, automation, bugs, details, environment };
}

async function suggestReport({ testRunId, userId }) {
  const context = await buildContext(testRunId);
  const metrics = {
    total: context.executions.length,
    passed: context.executions.filter((x) => x.result === 'Passed').length,
    failed: context.executions.filter((x) => x.result === 'Failed').length,
    blocked: context.executions.filter((x) => x.result === 'Blocked').length,
    skipped: context.executions.filter((x) => x.result === 'Skipped').length,
    manual: context.details.filter((detail) => detail.mode === 'Manual').length,
    auto: context.details.filter((detail) => detail.mode === 'Auto').length,
    unknownMode: context.details.filter((detail) => detail.mode === 'Unknown').length,
    bugs: context.bugs.length,
  };
  const input = {
    run: { name: redact(context.run.name), environment: redact(context.environment), status: context.run.status }, metrics,
    executions: context.details.map(({ execution: x, mode, targetUrl, latestRunnerStatus, latestFailureAnalysis, previousAttempts }) => ({
      title: redact(x.testCase?.title), priority: x.testCase?.priority, result: x.result,
      mode, environment: redact(targetUrl), latestRunnerStatus, qaVerdict: x.qaVerdict || null,
      runnerRootCause: redact(latestFailureAnalysis?.mostLikelyRootCause),
      runnerFailureType: latestFailureAnalysis?.failureType,
      previousAttempts: previousAttempts.map((attempt) => ({ status: attempt.status, framework: attempt.framework })),
      duration: x.duration, notes: redact(x.notes),
    })),
    bugs: context.bugs.map((x) => ({ title: redact(x.title), severity: x.severity, priority: x.priority, status: x.status, rootCause: redact(x.rootCause?.summary) })),
  };
  const coverage = {
    totalCases: metrics.total,
    executedCases: context.executions.filter((execution) => !['NotRun', 'Skipped'].includes(execution.result)).length,
    useCases: [...new Set(context.executions.map((x) => String(x.testCase?.e2e?.useCase || '')).filter(Boolean))].length,
    passRate: metrics.total ? Math.round((metrics.passed / metrics.total) * 10000) / 100 : 0,
  };
  let suggestion; let metadata = {};
  try {
    const response = await ai.complete({
      system: 'Bạn là QA Manager. Chỉ trả JSON, không bịa số liệu và không đưa dữ liệu nhạy cảm vào báo cáo.', json: true, maxTokens: 1800,
      prompt: `Tạo Test Summary Report tiếng Việt theo JSON {"title":"...","scope":["..."],"highlights":["..."],"risks":["..."],"recommendations":["..."],"releaseRecommendation":"Go|GoWithRisk|NoGo|Pending"}. mode là cách thực thi thực tế, không suy ra từ type của Test Case. result là kết luận cuối cùng của QA; latestRunnerStatus là kết quả runner mới nhất. previousAttempts chỉ là lịch sử: nếu lần mới nhất Passed thì lỗi cũ đã được khắc phục trong lần retry, không coi là lỗi hiện tại. Nếu QA và runner khác nhau, nêu rõ cả hai. Environment trong dữ liệu là runtime đã xác định, không suy diễn placeholder cũ. Chỉ nêu rủi ro có bằng chứng, không tự yêu cầu mọi test phải chạy thủ công hoặc tự động.\n${JSON.stringify(input)}`,
    });
    suggestion = ai.parseJson(response.text); metadata = { provider: response.provider, model: response.model, generatedAt: new Date() };
  } catch (error) {
    if (!ai.isGeminiQuotaExhausted(error)) throw error;
    suggestion = { title: `Test Summary - ${context.run.name}`, scope: [context.run.name], highlights: [`Tỷ lệ pass: ${coverage.passRate}%`], risks: metrics.failed ? [`Còn ${metrics.failed} test thất bại cần xử lý.`] : [], recommendations: metrics.failed ? ['Xem RCA, xử lý bug và chạy regression test.'] : ['Duy trì regression suite cho lần phát hành tiếp theo.'], releaseRecommendation: metrics.failed || metrics.blocked || metrics.skipped ? 'GoWithRisk' : 'Go' };
    metadata = { provider: 'Fallback', model: 'Deterministic', generatedAt: new Date(), warning: error.message };
  }
  const reportDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: process.env.REPORT_TIMEZONE || 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date()).replaceAll('-', '');
  const reportId = `TR-${reportDate}-${randomUUID().slice(0, 8)}`;
  const modeSummary = `${metrics.manual} Manual, ${metrics.auto} Auto${metrics.unknownMode ? `, ${metrics.unknownMode} chưa xác định cách thực thi` : ''}`;
  const history = context.details.flatMap(({ execution, previousAttempts, latestRunnerStatus }) => {
    if (!previousAttempts.length) return [];
    return [`${execution.testCase?.testCaseId || execution.testCase?.title}: ${previousAttempts.length} lần automation trước (${previousAttempts.map((attempt) => attempt.status).join(', ')}); runner mới nhất ${latestRunnerStatus}.`];
  });
  const overrides = context.details.filter(({ execution, latestRunnerStatus }) =>
    execution.qaVerdict && latestRunnerStatus && execution.qaVerdict !== latestRunnerStatus,
  ).map(({ execution, latestRunnerStatus }) => `${execution.testCase?.testCaseId || execution.testCase?.title}: QA kết luận ${execution.qaVerdict}, runner mới nhất ${latestRunnerStatus}.`);
  const executiveSummary = `Kết quả cuối cùng: ${metrics.total} Test Case (${modeSummary}); ${metrics.passed} Passed, ${metrics.failed} Failed, ${metrics.blocked} Blocked, ${metrics.skipped} Skipped. Tỷ lệ Passed: ${coverage.passRate}%. ${[...history, ...overrides].join(' ')}`.trim();
  return TestReport.create({
    project: context.project, testPlan: context.run.testPlan._id, testRun: context.run._id, reportId,
    title: safe(suggestion.title), executiveSummary: redact(executiveSummary),
    scope: (suggestion.scope || []).map(safe).slice(0, 30), environment: redact(context.environment).slice(0, 500),
    highlights: (suggestion.highlights || []).map(safe).slice(0, 20),
    risks: (suggestion.risks || []).map(safe).slice(0, 20),
    recommendations: (suggestion.recommendations || []).map(safe).slice(0, 20),
    releaseRecommendation: ['Go', 'GoWithRisk', 'NoGo', 'Pending'].includes(suggestion.releaseRecommendation) ? suggestion.releaseRecommendation : 'Pending',
    coverage,
    executionDetails: context.details.map(({ execution: x, mode, targetUrl, latestRunnerStatus, previousAttempts }) => ({
      testCaseId: x.testCase?.testCaseId || '', title: redact(x.testCase?.title), priority: x.testCase?.priority,
      result: x.result, qaVerdict: x.qaVerdict || null, mode, environment: redact(targetUrl), runnerResult: latestRunnerStatus,
      previousAttempts: previousAttempts.map((attempt) => ({ framework: attempt.framework, status: attempt.status })),
      duration: x.duration, actualResult: redact(x.actualResult),
    })),
    defectSummary: context.bugs.map((x) => ({ title: redact(x.title), severity: x.severity, priority: x.priority, status: x.status })),
    metrics, createdBy: userId, aiMetadata: metadata,
  });
}

function exportReport(report, format) { return exportArtifact('Test Summary Report', report, format); }

module.exports = { suggestReport, exportReport };
