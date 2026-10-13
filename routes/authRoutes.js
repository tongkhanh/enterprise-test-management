const router = require('express').Router();
const c = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/rbac');
const { asyncHandler, auditLog } = require('../middleware/error');

router.post('/register', asyncHandler(c.register));
router.post('/login', asyncHandler(c.login));
router.post('/logout', protect, asyncHandler(c.logout));
router.get('/me', protect, asyncHandler(c.me));
router.put('/me', protect, auditLog('UPDATE', 'User'), asyncHandler(c.updateProfile));
router.get('/sessions', protect, asyncHandler(c.sessions));
router.delete('/sessions/others', protect, asyncHandler(c.revokeOtherSessions));
router.delete('/sessions/:id', protect, asyncHandler(c.revokeSession));
router.get('/users', protect, authorizeRoles('System_Admin'), asyncHandler(c.listUsers));
router.patch('/users/:id/access', protect, authorizeRoles('System_Admin'), auditLog('PERMISSION_CHANGE', 'User'), asyncHandler(c.updateUserAccess));
router.get('/roles', protect, authorizeRoles('System_Admin'), asyncHandler(c.listRoles));
router.patch('/roles/:id', protect, authorizeRoles('System_Admin'), auditLog('PERMISSION_CHANGE', 'Role'), asyncHandler(c.updateRole));
router.get('/audit-logs', protect, authorizeRoles('System_Admin'), asyncHandler(c.auditLogs));

module.exports = router;
