const router = require('express').Router();
const c = require('../controllers/e2eController');
const { protect } = require('../middleware/auth');
const { authorize, authorizeWorkspaceList } = require('../middleware/rbac');
const { asyncHandler, auditLog } = require('../middleware/error');
router.use(protect);
router.get('/system-profiles', authorizeWorkspaceList('ai:use'), asyncHandler(c.listProfiles));
router.post('/system-profiles', authorize('ai:use'), auditLog('CREATE', 'SystemProfile'), asyncHandler(c.createProfile));
router.patch('/system-profiles/:id', authorize('ai:use'), auditLog('UPDATE', 'SystemProfile'), asyncHandler(c.updateProfile));
router.post('/system-profiles/github-analyze', authorize('ai:use'), auditLog('CREATE', 'SystemProfile'), asyncHandler(c.analyzeGithub));
router.get('/use-cases', authorizeWorkspaceList('ai:use'), asyncHandler(c.listUseCases));
router.post('/use-cases', authorize('ai:use'), auditLog('CREATE', 'UseCase'), asyncHandler(c.createUseCase));
router.patch('/use-cases/:id', authorize('ai:use'), auditLog('UPDATE', 'UseCase'), asyncHandler(c.updateUseCase));
router.patch('/use-cases/:id/decision', authorize('requirement:manage'), auditLog('APPROVE', 'UseCase'), asyncHandler(c.decideUseCase));
router.post('/system-profiles/:profileId/suggest-use-cases', authorize('ai:use'), auditLog('CREATE', 'UseCase'), asyncHandler(c.suggestUseCases));
router.post('/use-cases/:useCaseId/generate-story', authorize('ai:use'), auditLog('CREATE', 'UserStory'), asyncHandler(c.generateStory));
router.post('/use-cases/:useCaseId/generate-test-cases', authorize('ai:use'), auditLog('CREATE', 'TestCase'), asyncHandler(c.generateCases));
// Export reads one concrete E2E artifact.  Do the access check after loading
// that artifact in the controller, where its actual Project/Workspace is
// known.  The generic URL resolver cannot safely infer that relationship for
// every artifact type and was incorrectly returning 403 for valid members.
router.get('/e2e-artifacts/:type/:id/export', asyncHandler(c.exportE2EArtifact));
module.exports = router;
