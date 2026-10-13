const models = require('../models');
const { Workspace, WorkspaceMembership, Project, ProjectMembership, WorkspaceInvitation, ProjectInvitation } = models;
const { AppError, assertObjectId } = require('../utils/http');
const { ROLE_NAMES, WORKSPACE_ROLE_PERMISSIONS } = require('../config/roles');

const systemRoleNameOf = (user) => user?.role?.name || user?.role;

// Invitations accepted by older application versions can exist without their
// corresponding membership documents.  Reconcile them lazily for the invited
// account so an Accepted invitation always grants the Workspace/Project access
// it promises. Every operation is idempotent and only considers invitations
// tied to the current user (by acceptedBy or their exact normalized email).
const reconcileAcceptedInvitationMemberships = async (user) => {
  if (!user || systemRoleNameOf(user) === ROLE_NAMES.SYSTEM_ADMIN || !user.email) return;
  const email = String(user.email).trim().toLowerCase();
  const recipient = { $or: [{ acceptedBy: user._id }, { email }] };
  const [workspaceInvitations, projectInvitations] = await Promise.all([
    WorkspaceInvitation.find({ ...recipient, status: 'Accepted' }).select('workspace role invitedBy acceptedAt'),
    ProjectInvitation.find({ ...recipient, status: 'Accepted' }).select('workspace project role invitedBy team acceptedAt'),
  ]);

  await Promise.all(workspaceInvitations.map((invitation) => WorkspaceMembership.updateOne(
    { workspace: invitation.workspace, user: user._id },
    { $set: { role: invitation.role, invitedBy: invitation.invitedBy, isActive: true, joinedAt: invitation.acceptedAt || new Date() } },
    { upsert: true },
  )));

  await Promise.all(projectInvitations.flatMap((invitation) => [
    WorkspaceMembership.updateOne(
      { workspace: invitation.workspace, user: user._id },
      { $set: { role: invitation.role, invitedBy: invitation.invitedBy, isActive: true, joinedAt: invitation.acceptedAt || new Date() } },
      { upsert: true },
    ),
    ProjectMembership.updateOne(
      { project: invitation.project, user: user._id },
      { $set: { role: invitation.role, invitedBy: invitation.invitedBy, isActive: true, joinedAt: invitation.acceptedAt || new Date() }, ...(invitation.team ? { $addToSet: { teams: invitation.team } } : {}) },
      { upsert: true },
    ),
    Project.updateOne({ _id: invitation.project }, { $addToSet: { members: user._id } }),
  ]));

  // Project membership is a valid source of access even for memberships that
  // were created by older invite flows or imported data.  Promote it to the
  // enclosing Workspace membership as well: workspace-scoped list endpoints
  // (Projects, Approval Inbox, Teams) must never hide a Project a user has
  // already joined.  This is idempotent and keeps the most recent Project
  // role rather than relying on the account's system-level "User" role.
  const projectMemberships = await ProjectMembership.find({ user: user._id, isActive: true })
    .select('project role invitedBy joinedAt');
  if (projectMemberships.length) {
    const projects = await Project.find({ _id: { $in: projectMemberships.map((membership) => membership.project) } })
      .select('_id workspace');
    const workspaceByProject = new Map(projects.map((project) => [String(project._id), project.workspace]));
    const weights = { Guest: 1, Tester: 2, QA_Manager: 3, Owner: 4 };
    const bestByWorkspace = new Map();
    projectMemberships.forEach((membership) => {
      const workspace = workspaceByProject.get(String(membership.project));
      const current = workspace && bestByWorkspace.get(String(workspace));
      if (workspace && (!current || (weights[membership.role] || 0) > (weights[current.role] || 0))) {
        bestByWorkspace.set(String(workspace), { workspace, membership });
      }
    });
    const existing = await WorkspaceMembership.find({ workspace: { $in: [...bestByWorkspace.values()].map((item) => item.workspace) }, user: user._id, isActive: true }).select('workspace role');
    const existingRole = new Map(existing.map((membership) => [String(membership.workspace), membership.role]));
    await Promise.all([...bestByWorkspace.values()].map(({ workspace, membership }) => {
      if ((weights[existingRole.get(String(workspace))] || 0) >= (weights[membership.role] || 0)) return null;
      return WorkspaceMembership.updateOne(
        { workspace, user: user._id },
        { $set: { role: membership.role, invitedBy: membership.invitedBy, isActive: true, joinedAt: membership.joinedAt || new Date() } },
        { upsert: true },
      );
    }));
  }

  // Some legacy Project records have the user in Project.members but no
  // ProjectMembership row.  Treat that denormalized member list as an access
  // recovery source too.  It prevents an already-visible Project member from
  // being excluded by the Workspace-scoped project list.
  const directProjects = await Project.find({ members: user._id, isActive: true }).select('_id workspace');
  if (directProjects.length) {
    const knownMemberships = new Set(projectMemberships.map((membership) => String(membership.project)));
    const invitationRoles = await ProjectInvitation.find({
      project: { $in: directProjects.map((project) => project._id) },
      status: 'Accepted',
      $or: [{ acceptedBy: user._id }, { email }],
    }).select('project role invitedBy acceptedAt');
    const invitationByProject = new Map(invitationRoles.map((invitation) => [String(invitation.project), invitation]));
    await Promise.all(directProjects.filter((project) => !knownMemberships.has(String(project._id))).flatMap((project) => {
      const invitation = invitationByProject.get(String(project._id));
      const role = invitation?.role || 'Guest';
      const joinedAt = invitation?.acceptedAt || new Date();
      return [
        ProjectMembership.updateOne(
          { project: project._id, user: user._id },
          { $set: { role, invitedBy: invitation?.invitedBy || null, isActive: true, joinedAt } },
          { upsert: true },
        ),
        WorkspaceMembership.updateOne(
          { workspace: project.workspace, user: user._id },
          { $setOnInsert: { role, invitedBy: invitation?.invitedBy || null, isActive: true, joinedAt } },
          { upsert: true },
        ),
      ];
    }));
  }
};

const getWorkspaceRole = async (user, workspaceId) => {
  if (!user || !workspaceId) return null;
  const workspace = await Workspace.findById(workspaceId).select('owner');
  if (!workspace) return null;
  if (String(workspace.owner) === String(user._id)) return ROLE_NAMES.OWNER;
  const membership = await WorkspaceMembership.findOne({ workspace: workspace._id, user: user._id, isActive: true }).select('role');
  return membership?.role || null;
};

const workspaceRoleHasPermission = (role, permission) => {
  const permissions = WORKSPACE_ROLE_PERMISSIONS[role] || [];
  return permissions.includes('*') || permissions.includes(permission);
};

const assertWorkspaceAccess = async (user, workspaceId, options = {}) => {
  assertObjectId(workspaceId, 'Workspace ID');
  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) throw new AppError('Workspace không tồn tại.', 404);
  if (systemRoleNameOf(user) === ROLE_NAMES.SYSTEM_ADMIN) {
    throw new AppError('System Admin chỉ quản trị hệ thống, không tham gia Workspace.', 403);
  }
  const role = String(workspace.owner) === String(user._id)
    ? ROLE_NAMES.OWNER
    : (await WorkspaceMembership.findOne({ workspace: workspace._id, user: user._id, isActive: true }).select('role'))?.role;
  if (!role) throw new AppError('Bạn không phải thành viên Workspace này.', 403);
  // Roles are responsibility labels, not capability gates.  Membership is
  // still required above; permission checks below preserve Project scope.
  if (options.permission && !workspaceRoleHasPermission(role, options.permission)) {
    throw new AppError(`Vai trò ${role} không có quyền ${options.permission} trong Workspace này.`, 403);
  }
  if (options.manage && !workspaceRoleHasPermission(role, 'workspace:update')) {
    throw new AppError('Bạn không có quyền quản lý Workspace này.', 403);
  }
  return { workspace, role };
};

const getAccessibleWorkspaceIds = async (user) => {
  if (!user || systemRoleNameOf(user) === ROLE_NAMES.SYSTEM_ADMIN) return [];
  await reconcileAcceptedInvitationMemberships(user);
  const [owned, memberships] = await Promise.all([
    Workspace.find({ owner: user._id, isActive: true }).distinct('_id'),
    WorkspaceMembership.find({ user: user._id, isActive: true }).distinct('workspace'),
  ]);
  return [...new Set([...owned, ...memberships].map(String))];
};

const getProjectWorkspace = async (projectId) => {
  assertObjectId(projectId, 'Project ID');
  const project = await Project.findById(projectId);
  if (!project) throw new AppError('Project không tồn tại.', 404);
  return project;
};

const resolveWorkspaceIdFromRequest = async (req) => {
  const directWorkspace = req.body?.workspace || req.query?.workspace || req.params?.workspaceId;
  if (directWorkspace) return String(directWorkspace);
  // API payloads use both `project` and `projectId`.  Accept both forms so
  // authorization is evaluated against the selected workspace rather than the
  // very limited system-level User role.
  const directProject = req.body?.project || req.body?.projectId || req.query?.project || req.query?.projectId || req.params?.projectId;
  if (directProject) return String((await Project.findById(directProject).select('workspace'))?.workspace || '');

  const path = String(req.originalUrl || req.path || '').split('?')[0];
  if (path.includes('/workspaces/') && req.params?.id) return String(req.params.id);
  if (path.includes('/projects/') && req.params?.id) return String((await Project.findById(req.params.id).select('workspace'))?.workspace || '');
  // E2E routes identify resources with `profileId` and `useCaseId` rather
  // than the conventional `id`. Resolve those resources before falling back
  // to system-role permissions; otherwise an Owner/Tester is incorrectly
  // denied `ai:use` when suggesting Use Cases.
  const profileId = req.params?.profileId;
  if (profileId && String(req.originalUrl || req.path || '').includes('/system-profiles/')) {
    const projectId = (await models.SystemProfile.findById(profileId).select('project'))?.project;
    return projectId ? String((await Project.findById(projectId).select('workspace'))?.workspace || '') : null;
  }
  const useCaseId = req.params?.useCaseId;
  if (useCaseId && String(req.originalUrl || req.path || '').includes('/use-cases/')) {
    const projectId = (await models.UseCase.findById(useCaseId).select('project'))?.project;
    return projectId ? String((await Project.findById(projectId).select('workspace'))?.workspace || '') : null;
  }

  const id = req.params?.id;
  if (!id) return null;

  let projectId = null;
  // E2E artifact exports use a generic `type/:id` URL. Resolve the artifact
  // before RBAC checks so Workspace permissions are evaluated in the owning
  // Project instead of incorrectly falling back to the minimal system role.
  if (path.includes('/e2e-artifacts/')) {
    if (req.params?.type === 'use-case') projectId = (await models.UseCase.findById(id).select('project'))?.project;
    if (req.params?.type === 'user-story') projectId = (await models.UserStory.findById(id).select('project'))?.project;
    if (req.params?.type === 'test-case') {
      const testCase = await models.TestCase.findById(id).select('testSuite');
      projectId = testCase ? (await models.TestSuite.findById(testCase.testSuite).select('project'))?.project : null;
    }
    if (projectId) return String((await Project.findById(projectId).select('workspace'))?.workspace || '');
  }
  // Requirement endpoints address a User Story by its own id.  Resolve its
  // Project before evaluating RBAC so an Owner / QA Manager receives the
  // Workspace permission assigned to them, rather than falling back to the
  // minimal system-level `User` role.
  if (path.includes('/user-stories/')) {
    projectId = (await models.UserStory.findById(id).select('project'))?.project;
  }
  const scoped = [['/system-profiles/', models.SystemProfile], ['/use-cases/', models.UseCase], ['/automation-scripts/', models.AutomationScript], ['/test-environments/', models.TestEnvironment], ['/automation-runs/', models.AutomationRun], ['/test-reports/', models.TestReport], ['/test-plans/', models.TestPlan], ['/agile-issues/', models.AgileIssue], ['/execution-artifacts/', models.ExecutionArtifact]];
  for (const [prefix, Model] of scoped) if (path.includes(prefix)) projectId = (await Model.findById(id).select('project'))?.project;
  if (projectId) return String((await Project.findById(projectId).select('workspace'))?.workspace || '');
  if (path.includes('/test-runs/')) { const run = await models.TestRun.findById(id).populate('testPlan', 'project'); projectId = run?.testPlan?.project; if (projectId) return String((await Project.findById(projectId).select('workspace'))?.workspace || ''); }
  if (path.includes('/teams/')) {
    const team = await models.Team.findById(id).select('workspace project');
    if (team?.workspace) return String(team.workspace);
    projectId = team?.project;
  }
  else if (path.includes('/cycles/') || path.includes('/sprints/')) projectId = (await models.Sprint.findById(id).select('project'))?.project;
  else if (path.includes('/labels/')) projectId = (await models.ProjectLabel.findById(id).select('project'))?.project;
  else if (path.includes('/releases/')) projectId = (await models.Release.findById(id).select('project'))?.project;
  else if (path.includes('/test-suites/')) projectId = (await models.TestSuite.findById(id).select('project'))?.project;
  else if (path.includes('/shared-test-data/')) projectId = (await models.SharedTestData.findById(id).select('project'))?.project;
  else if (path.includes('/bugs/')) projectId = (await models.Bug.findById(id).select('project'))?.project;
  else if (path.includes('/integrations/')) {
    const integration = await models.IntegrationConnection.findById(id).select('workspace project');
    if (integration?.workspace) return String(integration.workspace);
    projectId = integration?.project;
  } else if (path.includes('/test-cases/')) {
    const testCase = await models.TestCase.findById(id).select('testSuite');
    projectId = testCase ? (await models.TestSuite.findById(testCase.testSuite).select('project'))?.project : null;
  } else if (path.includes('/review-requests/')) {
    const review = await models.ReviewRequest.findById(id).select('testCase');
    const testCase = review ? await models.TestCase.findById(review.testCase).select('testSuite') : null;
    projectId = testCase ? (await models.TestSuite.findById(testCase.testSuite).select('project'))?.project : null;
  }
  if (!projectId) return null;
  return String((await Project.findById(projectId).select('workspace'))?.workspace || '');
};

module.exports = {
  systemRoleNameOf,
  getWorkspaceRole,
  workspaceRoleHasPermission,
  assertWorkspaceAccess,
  getAccessibleWorkspaceIds,
  reconcileAcceptedInvitationMemberships,
  getProjectWorkspace,
  resolveWorkspaceIdFromRequest,
};
