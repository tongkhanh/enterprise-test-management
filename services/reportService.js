const cron = require('node-cron');
const { Bug, TestCase, TestRun, TestExecution, UserKpi, ScheduledReport } = require('../models');
const { sendReportEmail } = require('./emailService');

const jobs = new Map();

const buildSummary = async (report) => {
  const project = report.project;
  const bugMatch = { project, ...(report.filters?.severity ? { severity: { $in: report.filters.severity } } : {}) };
  if (report.reportType === 'BugSummary') {
    const byStatus = await Bug.aggregate([{ $match: bugMatch }, { $group: { _id: '$status', count: { $sum: 1 } } }]);
    const bySeverity = await Bug.aggregate([{ $match: bugMatch }, { $group: { _id: '$severity', count: { $sum: 1 } } }]);
    return { byStatus: Object.fromEntries(byStatus.map((x) => [x._id, x.count])), bySeverity: Object.fromEntries(bySeverity.map((x) => [x._id, x.count])) };
  }
  if (report.reportType === 'KPIReport') {
    const leaders = await UserKpi.find({ project, period: 'all-time' }).sort('-totalPoints').limit(20).populate('user', 'fullName').lean();
    return { leaderboard: leaders.map((item) => ({ user: item.user?.fullName, points: item.totalPoints, rank: item.rank })) };
  }
  const runs = await TestRun.find().populate({ path: 'testPlan', match: { project }, select: 'project' }).lean();
  const relevantRuns = runs.filter((run) => run.testPlan);
  const runIds = relevantRuns.map((run) => run._id);
  const executions = await TestExecution.countDocuments({ testRun: { $in: runIds } });
  return { testRuns: relevantRuns.length, executions, passed: relevantRuns.reduce((sum, run) => sum + run.passedCount, 0), failed: relevantRuns.reduce((sum, run) => sum + run.failedCount, 0), testCases: await TestCase.countDocuments() };
};

const runScheduledReport = async (reportOrId) => {
  const report = typeof reportOrId === 'string' ? await ScheduledReport.findById(reportOrId) : reportOrId;
  if (!report) return null;
  const summary = await buildSummary(report);
  const info = await sendReportEmail({ report, summary });
  report.lastRunAt = new Date(); await report.save({ validateBeforeSave: false });
  return { summary, messageId: info.messageId };
};

const scheduleReport = (report) => {
  const id = String(report._id);
  jobs.get(id)?.stop(); jobs.delete(id);
  if (!report.isActive || !cron.validate(report.cronExpression)) return false;
  const job = cron.schedule(report.cronExpression, () => runScheduledReport(id).catch((error) => console.error(`Scheduled report ${id}:`, error.message)), { timezone: process.env.REPORT_TIMEZONE || 'Asia/Bangkok' });
  jobs.set(id, job); return true;
};

const initializeReportSchedules = async () => {
  const reports = await ScheduledReport.find({ isActive: true });
  reports.forEach(scheduleReport);
  return reports.length;
};

module.exports = { buildSummary, runScheduledReport, scheduleReport, initializeReportSchedules };
