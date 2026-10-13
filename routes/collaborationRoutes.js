const router = require('express').Router();
const c = require('../controllers/collaborationController');
const { protect } = require('../middleware/auth');
const { authorize, authorizeWorkspaceList } = require('../middleware/rbac');
const { asyncHandler, auditLog } = require('../middleware/error');

router.get('/invitations/:token/public', asyncHandler(c.getPublicInvitation));
router.post('/invitations/:token/accept', asyncHandler(c.acceptInvitation));

router.use(protect);
router.get('/my-invitations', asyncHandler(c.myPendingInvitations));
router.post('/my-invitations/:id/accept', asyncHandler(c.acceptInvitationById));
router.get('/teams', authorizeWorkspaceList('team:read'), asyncHandler(c.listTeams));
router.post('/teams', authorize('project:update', 'team:manage'), auditLog('CREATE', 'Team'), asyncHandler(c.createTeam));
router.patch('/teams/:id', authorize('project:update', 'team:manage'), auditLog('UPDATE', 'Team'), asyncHandler(c.updateTeam));
router.delete('/teams/:id', authorize('project:update', 'team:manage'), auditLog('ARCHIVE', 'Team'), asyncHandler(c.archiveTeam));
router.post('/projects/:id/teams/:teamId', authorize('project:update'), auditLog('UPDATE', 'Project'), asyncHandler(c.linkTeamToProject));
router.delete('/projects/:id/teams/:teamId', authorize('project:update'), auditLog('UPDATE', 'Project'), asyncHandler(c.unlinkTeamFromProject));

router.get('/projects/:id/memberships', authorize('project:read'), asyncHandler(c.listMemberships));
router.patch('/projects/:id/memberships/:membershipId', authorize('project:update', 'member:invite'), auditLog('PERMISSION_CHANGE', 'ProjectMembership'), asyncHandler(c.updateMembership));
router.delete('/projects/:id/memberships/:membershipId', authorize('project:update', 'member:invite'), auditLog('UNASSIGN', 'ProjectMembership'), asyncHandler(c.removeMembership));
router.get('/projects/:id/invitations', authorize('project:update', 'member:invite'), asyncHandler(c.listInvitations));
router.post('/projects/:id/invitations', authorize('project:update', 'member:invite'), auditLog('INVITE', 'ProjectInvitation'), asyncHandler(c.createInvitation));
router.delete('/invitations/:id', authorize('project:update', 'member:invite'), auditLog('CANCEL', 'ProjectInvitation'), asyncHandler(c.cancelInvitation));
router.post('/invitations/:id/resend', authorize('project:update', 'member:invite'), auditLog('INVITE', 'ProjectInvitation'), asyncHandler(c.resendInvitation));

router.get('/integrations', authorizeWorkspaceList('integration:read'), asyncHandler(c.listIntegrations));
router.post('/integrations', authorize('project:update', 'integration:manage'), auditLog('CREATE', 'IntegrationConnection'), asyncHandler(c.createIntegration));
router.patch('/integrations/:id', authorize('project:update', 'integration:manage'), auditLog('UPDATE', 'IntegrationConnection'), asyncHandler(c.updateIntegration));
router.post('/integrations/:id/test', authorize('project:update', 'integration:manage'), auditLog('UPDATE', 'IntegrationConnection'), asyncHandler(c.testIntegration));
router.get('/integrations/:id/logs', authorize('project:update', 'integration:manage'), asyncHandler(c.listIntegrationLogs));
router.post('/integrations/:id/webhook-secret/rotate', authorize('project:update', 'integration:manage'), auditLog('UPDATE', 'IntegrationConnection'), asyncHandler(c.rotateIntegrationWebhook));
router.delete('/integrations/:id', authorize('project:update', 'integration:manage'), auditLog('DELETE', 'IntegrationConnection'), asyncHandler(c.deleteIntegration));

module.exports = router;
