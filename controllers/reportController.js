const cron = require('node-cron');
const {
  Bug, TestCase, TestSuite, TestPlan, TestRun, TestExecution, Project,
  Team, ProjectMembership, ProjectInvitation, IntegrationConnection, ReviewRequest, AuditLog,
  CustomDashboard, ScheduledReport, Notification, RiskAssessment, UserKpi, TestReport,
} = require('../models');
const { AppError, assertObjectId, list, getById, send } = require('../utils/http');
const { scheduleReport, runScheduledReport } = require('../services/reportService');
const { getAccessibleProjectIds, assertProjectAccess } = require('../services/projectAccessService');
const { suggestReport, exportReport } = require('../services/testReportService');

const overview = async (req, res) => {
  const accessibleProjectIds = req.allowedProjectIds || await getAccessibleProjectIds(req.user);
  const accessibleFilter = { _id: { $in: accessibleProjectIds } };
  if (req.query.project) accessibleFilter._id = req.query.project;
  const projectDocs = await Project.find(accessibleFilter).select('name key status lead members createdAt').sort('-updatedAt');
  const projectIds = projectDocs.map((project) => project._id);
  const suiteIds = await TestSuite.find({ project: { $in: projectIds } }).distinct('_id');
  const planIds = await TestPlan.find({ project: { $in: projectIds } }).distinct('_id');
  const bugFilter = { project: { $in: projectIds } };
  const [bugs, criticalBugs, testCases, caseStatusGroups, runs, recentRuns, executionStats, recentBugs, teams, members, pendingReviews, pendingInvites, integrations, recentActivity, bugGroups, caseGroups] = await Promise.all([
    Bug.countDocuments(bugFilter),
    Bug.countDocuments({ ...bugFilter, severity: 'Critical', status: { $nin: ['Closed', 'Verified'] } }),
    TestCase.countDocuments({ testSuite: { $in: suiteIds } }),
    TestCase.aggregate([{ $match: { testSuite: { $in: suiteIds } } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    TestRun.countDocuments({ testPlan: { $in: planIds } }),
    TestRun.find({ testPlan: { $in: planIds } }).sort('-createdAt').limit(5).select('name status environment totalCases passedCount failedCount createdAt testPlan').populate('testPlan', 'name project'),
    TestExecution.aggregate([{ $match: { testRun: { $in: await TestRun.find({ testPlan: { $in: planIds } }).distinct('_id') } } }, { $group: { _id: '$result', count: { $sum: 1 } } }]),
    Bug.find(bugFilter).sort('-createdAt').limit(5).select('title severity status createdAt project').populate('project', 'name key'),
    Team.countDocuments({ project: { $in: projectIds }, isArchived: false }),
    ProjectMembership.distinct('user', { project: { $in: projectIds }, isActive: true }),
    ReviewRequest.countDocuments({ reviewer: req.user._id, status: 'Pending' }),
    ProjectInvitation.countDocuments({ project: { $in: projectIds }, status: 'Pending' }),
    IntegrationConnection.countDocuments({ project: { $in: projectIds } }),
    AuditLog.find(req.user.workspace ? { workspace: req.user.workspace } : { performedBy: req.user._id }).sort('-createdAt').limit(8).select('action entityType description createdAt performedBy').populate('performedBy', 'fullName avatar'),
    Bug.aggregate([{ $match: bugFilter }, { $group: { _id: '$project', count: { $sum: 1 }, open: { $sum: { $cond: [{ $in: ['$status', ['Closed', 'Verified']] }, 0, 1] } } } }]),
    TestSuite.aggregate([{ $match: { project: { $in: projectIds } } }, { $lookup: { from: 'test_cases', localField: '_id', foreignField: 'testSuite', as: 'cases' } }, { $group: { _id: '$project', count: { $sum: { $size: '$cases' } } } }]),
  ]);
  const execution = Object.fromEntries(executionStats.map((item) => [item._id, item.count]));
  const testCaseStatus = Object.fromEntries(caseStatusGroups.map((item) => [item._id, item.count]));
  const executed = Object.entries(execution).filter(([key]) => key !== 'NotRun').reduce((sum, [, value]) => sum + value, 0);
  const bugsByProject = new Map(bugGroups.map((item) => [String(item._id), item]));
  const casesByProject = new Map(caseGroups.map((item) => [String(item._id), item.count]));
  const projects = projectDocs.slice(0, 6).map((project) => ({
    ...project.toObject(),
    bugCount: bugsByProject.get(String(project._id))?.count || 0,
    openBugs: bugsByProject.get(String(project._id))?.open || 0,
    testCaseCount: casesByProject.get(String(project._id)) || 0,
  }));
  send(res, {
    counts: {
      projects: projectDocs.length, teams, members: members.length, bugs, criticalBugs, testCases,
      draftCases: testCaseStatus.Draft || 0,
      reviewCases: testCaseStatus.NeedsReview || 0,
      approvedCases: (testCaseStatus.Approved || 0) + (testCaseStatus.Active || 0),
      rejectedCases: testCaseStatus.Rejected || 0,
      runs, pendingReviews, pendingInvites, integrations,
    },
    execution,
    passRate: executed ? Math.round(((execution.Passed || 0) / executed) * 10000) / 100 : 0,
    recentBugs,
    recentRuns,
    recentActivity,
    projects,
  });
};

const listNotifications = async (req, res) => { const result = await list(Notification, req, { baseFilter: { recipient: req.user._id }, filters: ['type', 'isRead'], populate: { path: 'sender', select: 'fullName avatar' } }); send(res, result.data, 200, { pagination: result.pagination, unread: await Notification.countDocuments({ recipient: req.user._id, isRead: false }) }); };
const markNotificationRead = async (req, res) => { const item = await Notification.findOneAndUpdate({ _id: req.params.id, recipient: req.user._id }, { isRead: true, readAt: new Date() }, { new: true }); if (!item) throw new AppError('Thông báo không tồn tại.', 404); send(res, item); };
const markAllRead = async (req, res) => { const result = await Notification.updateMany({ recipient: req.user._id, isRead: false }, { isRead: true, readAt: new Date() }); send(res, { updated: result.modifiedCount }); };

const listDashboards = async (req, res) => { const result = await list(CustomDashboard, req, { baseFilter: { user: req.user._id }, filters: ['project', 'isDefault'] }); send(res, result.data, 200, { pagination: result.pagination }); };
const createDashboard = async (req, res) => { if (req.body.isDefault) await CustomDashboard.updateMany({ user: req.user._id }, { isDefault: false }); send(res, await CustomDashboard.create({ ...req.body, user: req.user._id }), 201); };
const updateDashboard = async (req, res) => { const item = await CustomDashboard.findOne({ _id: req.params.id, user: req.user._id }); if (!item) throw new AppError('Dashboard không tồn tại.', 404); if (req.body.isDefault) await CustomDashboard.updateMany({ user: req.user._id, _id: { $ne: item._id } }, { isDefault: false }); Object.assign(item, req.body); await item.save(); send(res, item); };
const deleteDashboard = async (req, res) => { const item = await CustomDashboard.findOneAndDelete({ _id: req.params.id, user: req.user._id }); if (!item) throw new AppError('Dashboard không tồn tại.', 404); send(res, { _id: item._id }); };

const listSchedules = async (req, res) => { const projectIds = req.allowedProjectIds || await getAccessibleProjectIds(req.user); const result = await list(ScheduledReport, req, { baseFilter: { project: { $in: projectIds } }, filters: ['project', 'reportType', 'isActive'], searchFields: ['name'], populate: { path: 'createdBy', select: 'fullName' } }); send(res, result.data, 200, { pagination: result.pagination }); };
const createSchedule = async (req, res) => { if (!cron.validate(req.body.cronExpression)) throw new AppError('Cron expression không hợp lệ.', 400); const item = await ScheduledReport.create({ ...req.body, createdBy: req.user._id }); scheduleReport(item); send(res, item, 201); };
const updateSchedule = async (req, res) => { const item = await getById(ScheduledReport, req.params.id); Object.assign(item, req.body); if (!cron.validate(item.cronExpression)) throw new AppError('Cron expression không hợp lệ.', 400); await item.save(); scheduleReport(item); send(res, item); };
const deleteSchedule = async (req, res) => { const item = await getById(ScheduledReport, req.params.id); item.isActive = false; await item.save(); scheduleReport(item); await item.deleteOne(); send(res, { _id: item._id }); };
const runSchedule = async (req, res) => send(res, await runScheduledReport(await getById(ScheduledReport, req.params.id)));

const assessRisk = async (req, res) => {
  const { project, release } = req.body;
  if (!project) throw new AppError('project là bắt buộc.', 400);
  assertObjectId(project, 'Project ID');
  if (release) assertObjectId(release, 'Release ID');
  const match = { project: require('mongoose').Types.ObjectId.createFromHexString(project), status: { $nin: ['Closed', 'Verified'] }, ...(release ? { release: require('mongoose').Types.ObjectId.createFromHexString(release) } : {}) };
  const groups = await Bug.aggregate([{ $match: match }, { $group: { _id: '$userStory', total: { $sum: 1 }, critical: { $sum: { $cond: [{ $eq: ['$severity', 'Critical'] }, 1, 0] } }, major: { $sum: { $cond: [{ $eq: ['$severity', 'Major'] }, 1, 0] } } } }, { $addFields: { score: { $add: [{ $multiply: ['$critical', 5] }, { $multiply: ['$major', 3] }, '$total'] } } }, { $sort: { score: -1 } }]);
  const top = groups[0] || { total: 0, critical: 0, major: 0, score: 0 };
  const riskLevel = top.score >= 20 ? 'Critical' : top.score >= 12 ? 'High' : top.score >= 5 ? 'Medium' : 'Low';
  const assessment = await RiskAssessment.create({ title: `Đánh giá rủi ro chất lượng ${new Date().toLocaleDateString('vi-VN')}`, description: `Khu vực rủi ro cao nhất có ${top.critical} Critical, ${top.major} Major trên ${top.total} bug mở. Điểm ${top.score}.`, riskLevel, category: 'Quality', likelihood: Math.min(5, Math.max(1, Math.ceil(top.total / 3))), impact: Math.min(5, Math.max(1, top.critical * 2 + top.major)), project, release: release || null, assessedBy: req.user._id, mitigationPlan: req.body.mitigationPlan || 'Ưu tiên xử lý bug Critical/Major và tăng regression test.' });
  send(res, { assessment, hotspots: groups.slice(0, 10) }, 201);
};
const listRisks = async (req, res) => { const projectIds = req.allowedProjectIds || await getAccessibleProjectIds(req.user); const result = await list(RiskAssessment, req, { baseFilter: { project: { $in: projectIds } }, filters: ['project', 'release', 'riskLevel', 'status'], populate: { path: 'assessedBy', select: 'fullName' } }); send(res, result.data, 200, { pagination: result.pagination }); };
const leaderboard = async (req, res) => { const projectIds = req.allowedProjectIds || await getAccessibleProjectIds(req.user); const requested = req.query.project && projectIds.some((id) => String(id) === String(req.query.project)) ? [req.query.project] : projectIds; const data = await UserKpi.find({ project: { $in: requested }, period: req.query.period || 'all-time' }).sort('-totalPoints').limit(Math.min(Number(req.query.limit) || 20, 100)).populate('user', 'fullName avatar').populate('project', 'name key'); send(res, data); };

const listTestReports = async (req, res) => { const projects = await getAccessibleProjectIds(req.user); const allowed = projects.map(String); if (req.query.project && !allowed.includes(String(req.query.project))) throw new AppError('Bạn không thuộc Project này.', 403); const filter = { project: req.query.project || { $in: projects } }; send(res, await TestReport.find(filter).populate('testRun', 'name status').populate('createdBy approvedBy', 'fullName').sort('-createdAt').limit(100)); };
const suggestTestReport = async (req, res) => { const run = await TestRun.findById(req.params.id).populate('testPlan', 'project'); if (!run) throw new AppError('Test Run không tồn tại.', 404); await assertProjectAccess(req.user, run.testPlan.project); send(res, await suggestReport({ testRunId: run._id, userId: req.user._id }), 201); };
const decideTestReport = async (req, res) => { const report = await TestReport.findById(req.params.id); if (!report) throw new AppError('Test Report không tồn tại.', 404); await assertProjectAccess(req.user, report.project, { manage: true }); if (!['Approved', 'Rejected'].includes(req.body.decision)) throw new AppError('decision không hợp lệ.', 400); if (report.status !== 'PendingApproval') throw new AppError('Report không ở trạng thái chờ duyệt.', 409); if (req.body.decision === 'Rejected' && !String(req.body.reviewNote || '').trim()) throw new AppError('Cần nhập lý do từ chối.', 400); report.status = req.body.decision; report.reviewNote = String(req.body.reviewNote || '').trim().slice(0, 2000); report.approvedBy = req.body.decision === 'Approved' ? req.user._id : null; report.approvedAt = req.body.decision === 'Approved' ? new Date() : null; await report.save(); send(res, report); };
const downloadTestReport = async (req, res) => { const report = await TestReport.findById(req.params.id).lean(); if (!report) throw new AppError('Test Report không tồn tại.', 404); await assertProjectAccess(req.user, report.project); if (report.status !== 'Approved') throw new AppError('Chỉ Report đã Approved mới được export.', 409); const format = ['pdf', 'xls', 'csv', 'doc'].includes(req.query.format) ? req.query.format : 'pdf'; const output = await exportReport(report, format); res.setHeader('Content-Type', output.mime); res.setHeader('Content-Disposition', `attachment; filename="test-report-${report._id}.${output.ext}"`); res.send(output.buffer); };

module.exports = { overview, listNotifications, markNotificationRead, markAllRead, listDashboards, createDashboard, updateDashboard, deleteDashboard, listSchedules, createSchedule, updateSchedule, deleteSchedule, runSchedule, assessRisk, listRisks, leaderboard, listTestReports, suggestTestReport, decideTestReport, downloadTestReport };
