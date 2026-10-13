const router = require('express').Router();
const c = require('../controllers/aiController');
const { protect } = require('../middleware/auth');
const { authorize, authorizeRoles } = require('../middleware/rbac');
const { asyncHandler } = require('../middleware/error');
const { uploadRequirement } = require('../middleware/documentUpload');

router.use(protect);
// Artifact filenames are namespaced by user ID and the controller verifies that
// namespace.  Do not run workspace-scoped RBAC here: an artifact URL has no
// project context from which to resolve the caller's Workspace role.
router.get('/web-analysis/artifacts/:filename', asyncHandler(c.getWebAnalysisArtifact));
router.post('/suggest-user-story', authorize('ai:use'), asyncHandler(c.suggestUserStory));
router.post('/suggest-user-story/document', authorize('ai:use'), uploadRequirement, asyncHandler(c.suggestUserStoryFromDocument));
router.post('/suggest-user-story/github', authorize('ai:use'), asyncHandler(c.suggestUserStoryFromGithub));
router.post('/analyze-web-page', authorize('ai:use'), asyncHandler(c.analyzeWebPageForStory));
router.post('/generate-web-test-cases', authorize('ai:use'), asyncHandler(c.generateWebTestCases));
router.post('/analyze-root-cause/:automationResultId', authorize('ai:use'), asyncHandler(c.analyzeAutomationRootCause));
router.post('/generate-test-cases', authorize('ai:use'), asyncHandler(c.generateTestCases));
router.post('/suggest-severity', authorize('ai:use'), asyncHandler(c.suggestSeverity));
router.post('/detect-duplicates', authorize('ai:use'), asyncHandler(c.detectDuplicates));
router.post('/knowledge', authorize('ai:use'), asyncHandler(c.addKnowledge));
router.post('/chat', authorize('ai:use'), asyncHandler(c.chat));
router.get('/prompts', authorize('ai:use'), asyncHandler(c.listPrompts));
router.post('/prompts', authorizeRoles('System_Admin'), asyncHandler(c.createPrompt));
router.get('/logs', authorizeRoles('System_Admin'), asyncHandler(c.listLogs));

module.exports = router;
