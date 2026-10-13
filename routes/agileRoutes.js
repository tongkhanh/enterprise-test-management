const router = require('express').Router();
const c = require('../controllers/agileController');
const cycles = require('../controllers/cycleController');
const { protect } = require('../middleware/auth');
const { authorize, authorizeWorkspaceList } = require('../middleware/rbac');
const { asyncHandler, auditLog } = require('../middleware/error');

router.use(['/workspaces', '/projects', '/sprints', '/cycles', '/labels', '/releases'], protect);
// Listing workspaces must derive the caller's WorkspaceMembership before the
// controller builds its filter.  Using the scoped middleware keeps invited
// QA Managers aligned with Project listings and avoids falling back to their
// minimal system-level "User" role.
router.get('/workspaces', authorizeWorkspaceList('workspace:read'), asyncHandler(c.listWorkspaces));
router.post('/workspaces', authorize('workspace:create'), auditLog('CREATE', 'Workspace'), asyncHandler(c.createWorkspace));
router.patch('/workspaces/:id', authorize('workspace:update'), auditLog('UPDATE', 'Workspace'), asyncHandler(c.updateWorkspace));
router.get('/projects', authorizeWorkspaceList('project:read'), asyncHandler(c.listProjects));
router.get('/projects/:id', authorize('project:read'), asyncHandler(c.getProject));
router.get('/projects/:id/members', authorize('project:read'), asyncHandler(c.listProjectMembers));
router.post('/projects', authorize('project:create'), auditLog('CREATE', 'Project'), asyncHandler(c.createProject));
router.patch('/projects/:id', authorize('project:update'), auditLog('UPDATE', 'Project'), asyncHandler(c.updateProject));
router.delete('/projects/:id', authorize('project:update'), auditLog('DELETE', 'Project'), asyncHandler(c.deleteProject));
router.post('/projects/:id/members', authorize('project:update'), auditLog('ASSIGN', 'Project'), asyncHandler(c.addMember));
router.delete('/projects/:id/members/:userId', authorize('project:update'), auditLog('UNASSIGN', 'Project'), asyncHandler(c.removeMember));
router.get('/sprints', authorizeWorkspaceList('project:read'), asyncHandler(cycles.listCycles));
router.post('/sprints', authorize('agile:manage'), auditLog('CREATE', 'Sprint'), asyncHandler(cycles.createCycle));
router.patch('/sprints/:id', authorize('agile:manage'), auditLog('UPDATE', 'Sprint'), asyncHandler(cycles.updateCycle));
router.delete('/sprints/:id', authorize('agile:manage'), auditLog('DELETE', 'Sprint'), asyncHandler(cycles.deleteCycle));
router.get('/cycles', authorizeWorkspaceList('project:read'), asyncHandler(cycles.listCycles));
router.post('/cycles', authorize('agile:manage'), auditLog('CREATE', 'Sprint'), asyncHandler(cycles.createCycle));
router.patch('/cycles/:id', authorize('agile:manage'), auditLog('UPDATE', 'Sprint'), asyncHandler(cycles.updateCycle));
router.delete('/cycles/:id', authorize('agile:manage'), auditLog('DELETE', 'Sprint'), asyncHandler(cycles.deleteCycle));
router.get('/labels', authorize('project:read'), asyncHandler(cycles.listLabels));
router.post('/labels', authorize('agile:manage'), auditLog('CREATE', 'ProjectLabel'), asyncHandler(cycles.createLabel));
router.patch('/labels/:id', authorize('agile:manage'), auditLog('UPDATE', 'ProjectLabel'), asyncHandler(cycles.updateLabel));
router.delete('/labels/:id', authorize('agile:manage'), auditLog('DELETE', 'ProjectLabel'), asyncHandler(cycles.deleteLabel));
router.get('/projects/:id/activity', authorize('project:read'), asyncHandler(cycles.listProjectActivity));
router.get('/releases', authorizeWorkspaceList('project:read'), asyncHandler(c.listReleases));
router.post('/releases', authorize('agile:manage'), auditLog('CREATE', 'Release'), asyncHandler(c.createRelease));
router.patch('/releases/:id', authorize('agile:manage'), auditLog('UPDATE', 'Release'), asyncHandler(c.updateRelease));
router.delete('/releases/:id', authorize('agile:manage'), auditLog('DELETE', 'Release'), asyncHandler(c.deleteRelease));

module.exports = router;
