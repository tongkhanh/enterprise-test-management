const router = require('express').Router();
const c = require('../controllers/boardController');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { asyncHandler, auditLog } = require('../middleware/error');

router.use(protect);
router.get('/board-items', authorize('project:read'), asyncHandler(c.listBoard));
router.get('/board-items/:id', authorize('project:read'), asyncHandler(c.getBoardItem));
router.patch('/board-items/:id', authorize('execution:execute', 'execution:manage'), auditLog('UPDATE', 'BoardItem'), asyncHandler(c.updateBoardItem));
router.patch('/board-items/:id/move', authorize('execution:execute', 'execution:manage'), auditLog('STATUS_CHANGE', 'BoardItem'), asyncHandler(c.moveBoardItem));
router.post('/board-items/reorder', authorize('execution:execute', 'execution:manage'), asyncHandler(c.reorderColumn));
router.post('/board-items/create-plan', authorize('execution:execute', 'execution:manage'), auditLog('CREATE', 'TestPlan'), asyncHandler(c.createPlanFromBoard));

module.exports = router;
