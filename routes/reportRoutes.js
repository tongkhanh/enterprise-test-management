const router = require('express').Router();
const c = require('../controllers/reportController');
const { protect } = require('../middleware/auth');
const { authorize, authorizeWorkspaceList } = require('../middleware/rbac');
const { asyncHandler, auditLog } = require('../middleware/error');

router.use(['/reports', '/test-reports', '/test-runs', '/notifications', '/dashboards', '/scheduled-reports', '/risk-assessments', '/leaderboard'], protect);
router.get('/reports/overview', authorizeWorkspaceList('report:read'), asyncHandler(c.overview));
router.get('/notifications', asyncHandler(c.listNotifications));
router.patch('/notifications/read-all', asyncHandler(c.markAllRead));
router.patch('/notifications/:id/read', asyncHandler(c.markNotificationRead));
router.get('/dashboards', authorizeWorkspaceList('report:read'), asyncHandler(c.listDashboards));
router.post('/dashboards', authorize('report:read'), asyncHandler(c.createDashboard));
router.patch('/dashboards/:id', authorize('report:read'), asyncHandler(c.updateDashboard));
router.delete('/dashboards/:id', authorize('report:read'), asyncHandler(c.deleteDashboard));
router.get('/scheduled-reports', authorizeWorkspaceList('report:read'), asyncHandler(c.listSchedules));
router.post('/scheduled-reports', authorize('report:manage'), auditLog('CREATE', 'ScheduledReport'), asyncHandler(c.createSchedule));
router.patch('/scheduled-reports/:id', authorize('report:manage'), auditLog('UPDATE', 'ScheduledReport'), asyncHandler(c.updateSchedule));
router.delete('/scheduled-reports/:id', authorize('report:manage'), auditLog('DELETE', 'ScheduledReport'), asyncHandler(c.deleteSchedule));
router.post('/scheduled-reports/:id/run', authorize('report:manage'), asyncHandler(c.runSchedule));
router.get('/risk-assessments', authorizeWorkspaceList('report:read'), asyncHandler(c.listRisks));
router.post('/risk-assessments/calculate', authorize('report:manage'), auditLog('CREATE', 'RiskAssessment'), asyncHandler(c.assessRisk));
router.get('/leaderboard', authorizeWorkspaceList('report:read'), asyncHandler(c.leaderboard));
router.get('/test-reports', authorizeWorkspaceList('report:read'), asyncHandler(c.listTestReports));
router.post('/test-runs/:id/reports/suggest', authorize('report:read', 'report:manage'), auditLog('CREATE', 'TestReport'), asyncHandler(c.suggestTestReport));
router.patch('/test-reports/:id/decision', authorize('report:manage'), auditLog('APPROVE', 'TestReport'), asyncHandler(c.decideTestReport));
router.get('/test-reports/:id/export', authorize('report:read', 'report:manage'), asyncHandler(c.downloadTestReport));

module.exports = router;
