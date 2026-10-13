const router = require('express').Router();
const c = require('../controllers/workspaceCollaborationController');
const { protect } = require('../middleware/auth');
const { asyncHandler, auditLog } = require('../middleware/error');

router.get('/workspace-invitations/:token/public', asyncHandler(c.getPublicInvitation));
router.post('/workspace-invitations/:token/accept', asyncHandler(c.acceptInvitation));

router.use(protect);
router.get('/my-workspace-invitations', asyncHandler(c.myPendingInvitations));
router.post('/my-workspace-invitations/:id/accept', asyncHandler(c.acceptInvitationById));
router.get('/workspaces/:id/memberships', asyncHandler(c.listMemberships));
router.patch('/workspaces/:id/memberships/:membershipId', auditLog('PERMISSION_CHANGE', 'WorkspaceMembership'), asyncHandler(c.updateMembership));
router.delete('/workspaces/:id/memberships/:membershipId', auditLog('UNASSIGN', 'WorkspaceMembership'), asyncHandler(c.removeMembership));
router.get('/workspaces/:id/invitations', asyncHandler(c.listInvitations));
router.post('/workspaces/:id/invitations', auditLog('INVITE', 'WorkspaceInvitation'), asyncHandler(c.createInvitation));

module.exports = router;
