const router = require('express').Router();
const c = require('../controllers/testDesignController');
const { protect } = require('../middleware/auth');
const { authorize, authorizeWorkspaceList } = require('../middleware/rbac');
const { asyncHandler, auditLog } = require('../middleware/error');

router.use(['/test-suites', '/test-cases', '/shared-test-data', '/review-requests'], protect);
router.get('/test-suites', authorizeWorkspaceList('testcase:read'), asyncHandler(c.listSuites));
router.post('/test-suites', authorize('testcase:create'), auditLog('CREATE', 'TestSuite'), asyncHandler(c.createSuite));
router.patch('/test-suites/:id', authorize('testcase:update'), auditLog('UPDATE', 'TestSuite'), asyncHandler(c.updateSuite));
router.delete('/test-suites/:id', authorize('testcase:update'), auditLog('DELETE', 'TestSuite'), asyncHandler(c.deleteSuite));
router.get('/test-cases', authorizeWorkspaceList('testcase:read'), asyncHandler(c.listCases));
router.get('/test-cases/:id', authorize('testcase:read', 'testcase:create', 'testcase:update'), asyncHandler(c.getCase));
router.post('/test-cases', authorize('testcase:create'), auditLog('CREATE', 'TestCase'), asyncHandler(c.createCase));
router.patch('/test-cases/:id', authorize('testcase:update'), auditLog('UPDATE', 'TestCase'), asyncHandler(c.updateCase));
router.delete('/test-cases/:id', authorize('testcase:update'), auditLog('DELETE', 'TestCase'), asyncHandler(c.deleteCase));
router.get('/shared-test-data', authorizeWorkspaceList('testcase:read'), asyncHandler(c.listData));
router.post('/shared-test-data', authorize('testcase:create'), auditLog('CREATE', 'SharedTestData'), asyncHandler(c.createData));
router.patch('/shared-test-data/:id', authorize('testcase:update'), auditLog('UPDATE', 'SharedTestData'), asyncHandler(c.updateData));
router.delete('/shared-test-data/:id', authorize('testcase:update'), auditLog('DELETE', 'SharedTestData'), asyncHandler(c.deleteData));
router.get('/review-requests', authorizeWorkspaceList('testcase:read'), asyncHandler(c.listReviews));
router.post('/test-cases/:id/review', authorize('testcase:create'), auditLog('CREATE', 'ReviewRequest'), asyncHandler(c.submitReview));
router.patch('/review-requests/:id/decision', authorize('testcase:approve'), auditLog('APPROVE', 'ReviewRequest'), asyncHandler(c.decideReview));

module.exports = router;
