const { TestReport, TestRun, TestExecution, AutomationResult, Bug } = require('../models');
const { AppError } = require('../utils/http');
const ai = require('./aiService');
const { exportArtifact } = require('./artifactExportService');

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
    TestExecution.find({ testRun: run._id }).populate('testCase', 'testCaseId title priority type e2e').select('result duration notes actualResult testCase').lean(),
    AutomationResult.find({ testRun: run._id }).select('framework status duration failureAnalysis testCase').lean(),
    Bug.find({ project: run.testPlan.project, testExecution: { $in: await TestExecution.find({ testRun: run._id }).distinct('_id') } }).select('title severity priority status rootCause').lean(),
  ]);
  return { run, project: run.testPlan.project, executions, automation, bugs };
}

async function suggestReport({ testRunId, userId }) {
  const context = await buildContext(testRunId);
  const metrics = {
    total: context.run.totalCases || context.executions.length,
    passed: context.run.passedCount || context.executions.filter((x) => x.result === 'Passed').length,
    failed: context.run.failedCount || context.executions.filter((x) => x.result === 'Failed').length,
    blocked: context.run.blockedCount || context.executions.filter((x) => x.result === 'Blocked').length,
    skipped: context.run.skippedCount || context.executions.filter((x) => x.result === 'Skipped').length,
    bugs: context.bugs.length,
  };
  const input = {
    run: { name: context.run.name, environment: context.run.environment, status: context.run.status }, metrics,
    executions: context.executions.map((x) => ({ title: redact(x.testCase?.title), priority: x.testCase?.priority, result: x.result, duration: x.duration, notes: redact(x.notes) })),
    automation: context.automation.map((x) => ({ framework: x.framework, status: x.status, duration: x.duration, rootCause: redact(x.failureAnalysis?.mostLikelyRootCause), failureType: x.failureAnalysis?.failureType })),
    bugs: context.bugs.map((x) => ({ title: redact(x.title), severity: x.severity, priority: x.priority, status: x.status, rootCause: redact(x.rootCause?.summary) })),
  };
  const coverage = {
    totalCases: metrics.total,
    executedCases: metrics.total - (metrics.skipped || 0),
    useCases: [...new Set(context.executions.map((x) => String(x.testCase?.e2e?.useCase || '')).filter(Boolean))].length,
    passRate: metrics.total ? Math.round((metrics.passed / metrics.total) * 10000) / 100 : 0,
  };
  let suggestion; let metadata = {};
  try {
    const response = await ai.complete({
      system: 'Bạn là QA Manager. Chỉ trả JSON, không bịa số liệu và không đưa dữ liệu nhạy cảm vào báo cáo.', json: true, maxTokens: 1800,
      prompt: `Tạo Test Summary Report tiếng Việt theo JSON {"reportId":"TR-...","title":"...","executiveSummary":"...","scope":["..."],"environment":"...","highlights":["..."],"risks":["..."],"recommendations":["..."],"releaseRecommendation":"Go|GoWithRisk|NoGo|Pending"} từ dữ liệu đã được giới hạn sau:\n${JSON.stringify(input)}`,
    });
    suggestion = ai.parseJson(response.text); metadata = { provider: response.provider, model: response.model, generatedAt: new Date() };
  } catch (error) {
    if (!ai.isGeminiQuotaExhausted(error)) throw error;
    suggestion = { reportId: `TR-${Date.now()}`, title: `Test Summary - ${context.run.name}`, executiveSummary: `Đã thực thi ${metrics.total} test case: ${metrics.passed} Passed, ${metrics.failed} Failed, ${metrics.blocked} Blocked, ${metrics.skipped} Skipped.`, scope: [context.run.name], environment: context.run.environment || '', highlights: [`Tỷ lệ pass: ${metrics.total ? Math.round(metrics.passed / metrics.total * 100) : 0}%`], risks: metrics.failed ? [`Còn ${metrics.failed} test thất bại cần xử lý.`] : [], recommendations: metrics.failed ? ['Xem RCA, xử lý bug và chạy regression test.'] : ['Duy trì regression suite cho lần phát hành tiếp theo.'], releaseRecommendation: metrics.failed ? 'GoWithRisk' : 'Go' };
    metadata = { provider: 'Fallback', model: 'Deterministic', generatedAt: new Date(), warning: error.message };
  }
  return TestReport.create({ project: context.project, testPlan: context.run.testPlan._id, testRun: context.run._id, reportId: safe(suggestion.reportId || `TR-${Date.now()}`).slice(0, 80), title: safe(suggestion.title), executiveSummary: safe(suggestion.executiveSummary), scope: (suggestion.scope || []).map(safe).slice(0, 30), environment: safe(suggestion.environment || context.run.environment).slice(0, 500), highlights: (suggestion.highlights || []).map(safe).slice(0, 20), risks: (suggestion.risks || []).map(safe).slice(0, 20), recommendations: (suggestion.recommendations || []).map(safe).slice(0, 20), releaseRecommendation: ['Go', 'GoWithRisk', 'NoGo', 'Pending'].includes(suggestion.releaseRecommendation) ? suggestion.releaseRecommendation : 'Pending', coverage, executionDetails: context.executions.map((x) => ({ testCaseId: x.testCase?.testCaseId || '', title: redact(x.testCase?.title), priority: x.testCase?.priority, result: x.result, duration: x.duration, actualResult: redact(x.actualResult) })), defectSummary: context.bugs.map((x) => ({ title: redact(x.title), severity: x.severity, priority: x.priority, status: x.status })), metrics, createdBy: userId, aiMetadata: metadata });
}

function exportReport(report, format) { return exportArtifact('Test Summary Report', report, format); }

module.exports = { suggestReport, exportReport };
