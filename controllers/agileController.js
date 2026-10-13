const { Workspace, Project, Sprint, Release, User, WorkspaceMembership, ProjectMembership, Team, UserStory, TestSuite, TestCase, TestPlan, TestRun, AutomationRun, Bug, AgileIssue, ProjectInvitation } = require('../models');
const { AppError, list, getById, send } = require('../utils/http');
const { assertProjectAccess } = require('../services/projectAccessService');
const { assertWorkspaceAccess, getAccessibleWorkspaceIds, getWorkspaceRole } = require('../services/workspaceAccessService');
const { recordProjectActivity } = require('../services/projectActivityService');
const { ROLE_NAMES, PROJECT_ROLE_NAMES } = require('../config/roles');

const listWorkspaces = async (req, res) => {
  const workspaceIds = req.allowedWorkspaceIds || await getAccessibleWorkspaceIds(req.user);
  const filter = { _id: { $in: workspaceIds } };
  const result = await list(Workspace, req, { baseFilter: filter, filters: ['plan', 'isActive'], searchFields: ['name', 'slug'], populate: { path: 'owner', select: 'fullName email' } });
  const data = await Promise.all(result.data.map(async (workspace) => ({
    ...workspace.toObject(),
    currentRole: await getWorkspaceRole(req.user, workspace._id),
  })));
  send(res, data, 200, { pagination: result.pagination });
};

const createWorkspace = async (req, res) => {
  const planLimits = { Free: 5, Pro: 50, Enterprise: 10000 };
  const plan = req.body.plan || 'Free';
  const workspace = await Workspace.create({ ...req.body, plan, maxMembers: req.body.maxMembers || planLimits[plan], owner: req.user._id });
  await WorkspaceMembership.updateOne(
    { workspace: workspace._id, user: req.user._id },
    { $set: { role: ROLE_NAMES.OWNER, isActive: true, joinedAt: new Date() } },
    { upsert: true },
  );
  if (!req.user.workspace) {
    req.user.workspace = workspace._id;
    await req.user.save({ validateBeforeSave: false });
  }
  send(res, workspace, 201);
};

const updateWorkspace = async (req, res) => {
  const workspace = await getById(Workspace, req.params.id);
  await assertWorkspaceAccess(req.user, workspace._id, { manage: true, permission: 'workspace:update' });
  req._auditBefore = workspace.toObject();
  const editable = ['name', 'slug', 'description', 'logo', 'plan', 'maxMembers', 'isActive'];
  editable.forEach((key) => { if (req.body[key] !== undefined) workspace[key] = req.body[key]; });
  await workspace.save();
  send(res, workspace);
};

const listProjects = async (req, res) => {
  const workspaceIds = req.allowedWorkspaceIds || await getAccessibleWorkspaceIds(req.user);
  const baseFilter = {
    workspace: req.query.workspace || { $in: workspaceIds },
  };
  const result = await list(Project, req, {
    baseFilter,
    filters: ['status', 'lead'],
    searchFields: ['name', 'key', 'description'],
    populate: [
      { path: 'workspace', select: 'name slug' },
      { path: 'lead', select: 'fullName email role', populate: { path: 'role', select: 'name' } },
      { path: 'members', select: 'fullName email role status', populate: { path: 'role', select: 'name' } },
      { path: 'teams', select: 'name key color members' },
    ],
  });
  const data = await Promise.all(result.data.map(async (project) => ({
    ...project.toObject(),
    currentRole: await getWorkspaceRole(req.user, project.workspace),
  })));
  send(res, data, 200, { pagination: result.pagination });
};

const getProject = async (req, res) => {
  const project = await getById(Project, req.params.id, [
    { path: 'workspace', select: 'name slug plan' },
    { path: 'lead', select: 'fullName email avatar role', populate: { path: 'role', select: 'name' } },
    { path: 'members', select: 'fullName email avatar status role', populate: { path: 'role', select: 'name' } },
    { path: 'teams', select: 'name key color isPrivate isArchived members lead', populate: [{ path: 'lead', select: 'fullName email avatar' }, { path: 'members', select: 'fullName email avatar' }] },
  ]);
  const access = await assertProjectAccess(req.user, project._id, { permission: 'project:read' });
  const suites = await TestSuite.find({ project: project._id }).distinct('_id');
  const [memberships, pendingInvitations, stories, cases, plans, runs, automationRuns, bugs, issues, cycles, teams] = await Promise.all([
    ProjectMembership.find({ project: project._id, isActive: true }).populate('user', 'fullName email avatar status').populate('teams', 'name key color').sort('role joinedAt'),
    ProjectInvitation.countDocuments({ project: project._id, status: 'Pending' }),
    UserStory.countDocuments({ project: project._id }),
    TestCase.countDocuments({ testSuite: { $in: suites } }),
    TestPlan.countDocuments({ project: project._id }),
    TestRun.countDocuments({ project: project._id }),
    AutomationRun.countDocuments({ project: project._id }),
    Bug.countDocuments({ project: project._id }),
    AgileIssue.countDocuments({ project: project._id }),
    Sprint.countDocuments({ project: project._id }),
    Team.find({ workspace: project.workspace, $or: [{ project: project._id }, { projects: project._id }] }).select('name key color isPrivate isArchived lead members').populate('lead members', 'fullName email avatar'),
  ]);
  send(res, { ...project.toObject(), teams, memberships, currentRole: access.workspaceRole, summary: { members: memberships.length, pendingInvitations, userStories: stories, testCases: cases, testPlans: plans, testRuns: runs, automationRuns, bugs, agileIssues: issues, cycles } });
};

const listProjectMembers = async (req, res) => {
  const project = await getById(Project, req.params.id);
  await assertProjectAccess(req.user, project._id, { permission: 'member:read' });
  const memberships = await ProjectMembership.find({ project: project._id, isActive: true }).populate('user', 'fullName email role avatar status').populate('teams', 'name key color').populate({ path: 'user', populate: { path: 'role', select: 'name' } }).sort('role joinedAt');
  send(res, memberships.map((item) => ({ ...item.user.toObject(), projectRole: item.role, teams: item.teams || [], membershipId: item._id })));
};

const createProject = async (req, res) => {
  const workspace = await getById(Workspace, req.body.workspace || req.user.workspace);
  await assertWorkspaceAccess(req.user, workspace._id, { manage: true, permission: 'project:create' });
  const leadId = req.body.lead || req.user._id;
  const lead = await User.findById(leadId);
  const leadRole = lead ? await getWorkspaceRole(lead, workspace._id) : null;
  if (!lead || !leadRole) throw new AppError('Project Lead phải là thành viên Workspace.', 409);
  const memberIds = [...new Set([...(req.body.members || []).map(String), String(req.user._id), String(lead._id)])];
  if (memberIds.length > workspace.maxMembers) throw new AppError(`Gói ${workspace.plan} chỉ cho phép tối đa ${workspace.maxMembers} thành viên.`, 409);
  const project = await Project.create({ ...req.body, workspace: workspace._id, members: memberIds, lead: lead._id });
  await Promise.all(memberIds.map((userId) => ProjectMembership.updateOne(
    { project: project._id, user: userId },
    { $set: { role: userId === String(project.lead) ? ROLE_NAMES.QA_MANAGER : ROLE_NAMES.TESTER, isActive: true, joinedAt: new Date() } },
    { upsert: true },
  )));
  await recordProjectActivity({ project: project._id, actor: req.user._id, action: 'CREATED', entityType: 'Project', entityId: project._id, title: `Đã tạo Project ${project.key} · ${project.name}` });
  send(res, project, 201);
};

const updateProject = async (req, res) => {
  const project = await getById(Project, req.params.id);
  await assertProjectAccess(req.user, project._id, { manage: true });
  req._auditBefore = project.toObject();
  const editable = ['name', 'key', 'description', 'status', 'startDate', 'endDate', 'tags', 'lead'];
  editable.forEach((key) => { if (req.body[key] !== undefined) project[key] = req.body[key]; });
  await project.save();
  await recordProjectActivity({ project: project._id, actor: req.user._id, action: 'UPDATED', entityType: 'Project', entityId: project._id, title: `Đã cập nhật Project ${project.key}`, changes: { before: req._auditBefore, after: project.toObject() } });
  send(res, project);
};

const deleteProject = async (req, res) => {
  const project = await getById(Project, req.params.id);
  await assertProjectAccess(req.user, project._id, { manage: true });
  req._auditBefore = project.toObject();
  await project.deleteOne();
  send(res, { _id: project._id });
};

const addMember = async (req, res) => {
  const project = await getById(Project, req.params.id);
  await assertProjectAccess(req.user, project._id, { manage: true });
  const workspace = await getById(Workspace, project.workspace);
  const user = await getById(User, req.body.userId);
  const workspaceRole = await getWorkspaceRole(user, workspace._id);
  if (!workspaceRole) throw new AppError('Người dùng phải tham gia Workspace trước khi được gán vào Project.', 409);
  if (!project.members.some((id) => id.equals(user._id)) && project.members.length >= workspace.maxMembers) {
    throw new AppError(`Đã đạt giới hạn ${workspace.maxMembers} thành viên của workspace.`, 409);
  }
  project.members.addToSet(user._id);
  if (!user.workspace) user.workspace = workspace._id;
  const projectRole = req.body.role || (workspaceRole === ROLE_NAMES.OWNER ? ROLE_NAMES.QA_MANAGER : workspaceRole);
  if (!PROJECT_ROLE_NAMES.includes(projectRole)) throw new AppError('Vai trò Project không hợp lệ.', 400);
  await Promise.all([
    project.save(),
    user.save({ validateBeforeSave: false }),
    ProjectMembership.updateOne(
      { project: project._id, user: user._id },
      { $set: { role: projectRole, isActive: true, joinedAt: new Date(), invitedBy: req.user._id } },
      { upsert: true },
    ),
  ]);
  send(res, project);
};

const removeMember = async (req, res) => {
  const project = await getById(Project, req.params.id);
  await assertProjectAccess(req.user, project._id, { manage: true });
  if (String(project.lead) === String(req.params.userId)) throw new AppError('Không thể xóa Project Lead.', 409);
  project.members.pull(req.params.userId);
  await Promise.all([project.save(), ProjectMembership.updateOne({ project: project._id, user: req.params.userId }, { isActive: false })]);
  send(res, project);
};

const listSprints = async (req, res) => {
  const result = await list(Sprint, req, { filters: ['project', 'status'], searchFields: ['name', 'goal'], populate: [{ path: 'project', select: 'name key' }, { path: 'createdBy', select: 'fullName' }] });
  send(res, result.data, 200, { pagination: result.pagination });
};

const createSprint = async (req, res) => {
  if (new Date(req.body.endDate) <= new Date(req.body.startDate)) throw new AppError('Ngày kết thúc Sprint phải sau ngày bắt đầu.', 400);
  send(res, await Sprint.create({ ...req.body, createdBy: req.user._id }), 201);
};

const updateSprint = async (req, res) => {
  const sprint = await getById(Sprint, req.params.id);
  req._auditBefore = sprint.toObject();
  Object.assign(sprint, req.body);
  if (new Date(sprint.endDate) <= new Date(sprint.startDate)) throw new AppError('Ngày kết thúc Sprint phải sau ngày bắt đầu.', 400);
  await sprint.save();
  send(res, sprint);
};

const deleteSprint = async (req, res) => {
  const sprint = await getById(Sprint, req.params.id);
  req._auditBefore = sprint.toObject();
  await sprint.deleteOne();
  send(res, { _id: sprint._id });
};

const listReleases = async (req, res) => {
  const workspaceIds = req.allowedWorkspaceIds || await getAccessibleWorkspaceIds(req.user);
  const projectIds = req.allowedProjectIds || await Project.find({ workspace: { $in: workspaceIds } }).distinct('_id');
  const result = await list(Release, req, { baseFilter: { project: { $in: projectIds } }, filters: ['project', 'status'], searchFields: ['name', 'version', 'releaseNotes'], populate: [{ path: 'project', select: 'name key' }, { path: 'manager', select: 'fullName' }] });
  send(res, result.data, 200, { pagination: result.pagination });
};

const createRelease = async (req, res) => { await assertProjectAccess(req.user, req.body.project, { manage: true }); send(res, await Release.create({ ...req.body, manager: req.body.manager || req.user._id }), 201); };

const updateRelease = async (req, res) => {
  const release = await getById(Release, req.params.id);
  await assertProjectAccess(req.user, release.project, { manage: true });
  req._auditBefore = release.toObject();
  Object.assign(release, req.body);
  if (release.status === 'Production' && !release.actualReleaseDate) release.actualReleaseDate = new Date();
  await release.save();
  send(res, release);
};

const deleteRelease = async (req, res) => {
  const release = await getById(Release, req.params.id);
  await assertProjectAccess(req.user, release.project, { manage: true });
  req._auditBefore = release.toObject();
  await release.deleteOne();
  send(res, { _id: release._id });
};

module.exports = {
  listWorkspaces, createWorkspace, updateWorkspace,
  listProjects, getProject, listProjectMembers, createProject, updateProject, deleteProject, addMember, removeMember,
  listSprints, createSprint, updateSprint, deleteSprint,
  listReleases, createRelease, updateRelease, deleteRelease,
};
