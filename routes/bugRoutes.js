const router = require('express').Router();
const c = require('../controllers/bugController');
const { protect } = require('../middleware/auth');
const { authorize, authorizeWorkspaceList } = require('../middleware/rbac');
const { asyncHandler, auditLog } = require('../middleware/error');

router.use('/bugs', protect);
router.get('/bugs', authorizeWorkspaceList('bug:read'), asyncHandler(c.listBugs));
router.get('/bugs/:id', authorize('bug:read', 'bug:create', 'bug:manage'), asyncHandler(c.getBug));
router.post('/bugs', authorize('bug:create', 'bug:manage'), auditLog('CREATE', 'Bug'), asyncHandler(c.createBug));
router.patch('/bugs/:id', authorize('bug:update', 'bug:manage'), auditLog('UPDATE', 'Bug'), asyncHandler(c.updateBug));
router.delete('/bugs/:id', authorize('bug:manage'), auditLog('DELETE', 'Bug'), asyncHandler(c.deleteBug));
router.post('/bugs/:id/retests', authorize('bug:retest', 'bug:manage'), auditLog('CREATE', 'BugRetest'), asyncHandler(c.createRetest));
router.patch('/bugs/:id/decision', authorize('bug:manage'), auditLog('APPROVE', 'Bug'), asyncHandler(c.decideBug));

module.exports = router;
