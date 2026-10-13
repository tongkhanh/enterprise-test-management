const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const {
  Team, Project, Workspace, User, Role, WorkspaceMembership, ProjectMembership,
  ProjectInvitation, IntegrationConnection, IntegrationSyncLog,
} = require('../models');
const { AppError, assertObjectId, list, getById, send } = require('../utils/http');
const { sendProjectInvitationEmail } = require('../services/emailService');
const { encryptCredential } = require('../services/integrationCredentialService');
const { testIntegrationConnection, rotateWebhookSecret } = require('../services/integrationService');
const { assertProjectAccess, getAccessibleProjectIds } = require('../services/projectAccessService');
const { assertWorkspaceAccess } = require('../services/workspaceAccessService');
const { ROLE_NAMES, PROJECT_ROLE_NAMES } = require('../config/roles');

const INVITE_ROLES = PROJECT_ROLE_NAMES;
const ROLE_WEIGHT = { Guest: 1, Tester: 2, QA_Manager: 3 };
const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

const invitationUrl = (rawToken) => {
  const appUrl = String(process.env.APP_BASE_URL || 'http://localhost:5000/studio').replace(/\/$/, '');
  return `${appUrl}/accept-invite?token=${encodeURIComponent(rawToken)}`;
};

const deliverInvitation = async ({ invitation, inviter, project, team, rawToken }) => {
  const inviteUrl = invitationUrl(rawToken);
  try {
    const delivery = await sendProjectInvitationEmail({ invitation, inviter, project, team, inviteUrl });
    invitation.emailDelivery = delivery.delivered ? 'Sent' : 'Skipped';
  } catch {
    invitation.emailDelivery = 'Failed';
  }
  await invitation.save();
  return inviteUrl;
};

const publicIntegration = (document) => {
  const value = document?.toObject ? document.toObject() : { ...document };
  delete value.credentialCiphertext;
  delete value.webhookSecretCiphertext;
  return value;
};

const assertProjectManager = async (project, user) => {
  await assertProjectAccess(user, project._id, { manage: true });
};

const accessibleProjectIds = async (user) => {
  return getAccessibleProjectIds(user);
};

const listTeams = async (req, res) => {
  const allowed = req.allowedProjectIds || await accessibleProjectIds(req.user);
  if (allowed && req.query.project && !allowed.some((id) => String(id) === String(req.query.project))) throw new AppError('Bạn không thuộc Project này.', 403);
  const baseFilter = {
    ...(req.query.project ? { $or: [{ project: req.query.project }, { projects: req.query.project }] } : {}),
    ...(!req.query.project && req.allowedWorkspaceIds ? { workspace: { $in: req.allowedWorkspaceIds } } : {}),
  };
  const result = await list(Team, req, {
    baseFilter,
    filters: ['workspace', 'isArchived'],
    searchFields: ['name', 'key', 'description'],
    populate: [
      { path: 'project', select: 'name key' },
      { path: 'projects', select: 'name key status' },
      { path: 'lead members', select: 'fullName email avatar role', populate: { path: 'role', select: 'name' } },
    ],
  });
  send(res, result.data, 200, { pagination: result.pagination });
};

const createTeam = async (req, res) => {
  if (!req.body.name || !req.body.key) throw new AppError('Tên Team và mã Team là bắt buộc.', 400);
  const workspaceId = req.body.workspace || req.user.workspace;
  const { workspace } = await assertWorkspaceAccess(req.user, workspaceId, { manage: true, permission: 'team:manage' });
  const project = req.body.project ? await getById(Project, req.body.project) : null;
  if (project && String(project.workspace) !== String(workspace._id)) throw new AppError('Project không thuộc Workspace.', 409);
  if (project) await assertProjectManager(project, req.user);
  const linkedProjectIds = project ? [project._id] : [...new Set((req.body.projects || []).map(String))];
  if (linkedProjectIds.length) {
    const valid = await Project.find({ _id: { $in: linkedProjectIds }, workspace: workspace._id }).distinct('_id');
    if (valid.length !== linkedProjectIds.length) throw new AppError('Có Project không thuộc Workspace.', 409);
  }
  const lead = req.body.lead || req.user._id;
  const members = [...new Set([String(lead), String(req.user._id), ...(req.body.members || []).map(String)])];
  const workspaceUsers = await WorkspaceMembership.find({ workspace: workspace._id, user: { $in: members }, isActive: true }).distinct('user');
  const hasOwner = String(workspace.owner) === String(lead);
  if (workspaceUsers.length + (hasOwner ? 1 : 0) < members.length) throw new AppError('Team chỉ có thể chứa thành viên đã tham gia Workspace.', 409);
  const team = await Team.create({
    name: req.body.name,
    key: req.body.key,
    description: req.body.description || '',
    color: req.body.color || '#5B4EF2',
    workspace: workspace._id,
    project: project?._id || null,
    projects: linkedProjectIds,
    isPrivate: Boolean(req.body.isPrivate),
    cycleSettings: req.body.cycleSettings || undefined,
    lead,
    members,
    createdBy: req.user._id,
  });
  // Team membership is not an implicit Project grant. Project access remains
  // explicit through ProjectInvitation/ProjectMembership.
  if (project) { project.teams.addToSet(team._id); await project.save(); }
  if (linkedProjectIds.length && !project) await Project.updateMany({ _id: { $in: linkedProjectIds } }, { $addToSet: { teams: team._id } });
  await team.populate([{ path: 'project', select: 'name key' }, { path: 'projects', select: 'name key' }, { path: 'lead members', select: 'fullName email avatar' }]);
  send(res, team, 201);
};

const updateTeam = async (req, res) => {
  const team = await getById(Team, req.params.id);
  await assertWorkspaceAccess(req.user, team.workspace, { manage: true, permission: 'team:manage' });
  const editable = ['name', 'key', 'description', 'color', 'lead', 'isArchived', 'isPrivate', 'cycleSettings'];
  editable.forEach((key) => { if (req.body[key] !== undefined) team[key] = req.body[key]; });
  if (req.body.projects !== undefined) {
    const projectIds = [...new Set((req.body.projects || []).map(String))];
    const projects = await Project.find({ _id: { $in: projectIds }, workspace: team.workspace }).select('_id teams');
    if (projects.length !== projectIds.length) throw new AppError('Có Project không thuộc Workspace của Team.', 400);
    const previousIds = (team.projects || []).map(String);
    team.projects = projects.map((project) => project._id);
    if (!team.project || !projectIds.includes(String(team.project))) team.project = projects[0]?._id || null;
    await Project.updateMany({ _id: { $in: previousIds } }, { $pull: { teams: team._id } });
    if (projectIds.length) await Project.updateMany({ _id: { $in: projectIds } }, { $addToSet: { teams: team._id } });
  }
  if (req.body.members !== undefined) {
    const memberIds = [...new Set((req.body.members || []).map(String))];
    if (team.lead) memberIds.push(String(team.lead));
    const uniqueMemberIds = [...new Set(memberIds)];
    const activeWorkspaceUsers = await WorkspaceMembership.find({ workspace: team.workspace, user: { $in: uniqueMemberIds }, isActive: true }).distinct('user');
    const workspace = await Workspace.findById(team.workspace).select('owner');
    const validIds = new Set(activeWorkspaceUsers.map(String));
    if (workspace?.owner) validIds.add(String(workspace.owner));
    if (uniqueMemberIds.some((id) => !validIds.has(id))) throw new AppError('Team chỉ có thể chứa thành viên đang hoạt động trong Workspace.', 409);
    const removed = (team.members || []).map(String).filter((id) => !uniqueMemberIds.includes(id));
    team.members = uniqueMemberIds;
    if (removed.length) await ProjectMembership.updateMany({ teams: team._id, user: { $in: removed } }, { $pull: { teams: team._id } });
  }
  await team.save();
  await team.populate([{ path: 'project', select: 'name key' }, { path: 'projects', select: 'name key' }, { path: 'lead members', select: 'fullName email avatar' }]);
  send(res, team);
};

const archiveTeam = async (req, res) => {
  const team = await getById(Team, req.params.id);
  await assertWorkspaceAccess(req.user, team.workspace, { manage: true, permission: 'team:manage' });
  team.isArchived = true;
  await team.save();
  send(res, team);
};

const linkTeamToProject = async (req, res) => {
  const project = await getById(Project, req.params.id);
  await assertProjectManager(project, req.user);
  const team = await getById(Team, req.params.teamId);
  if (String(team.workspace) !== String(project.workspace)) throw new AppError('Team và Project phải cùng Workspace.', 409);
  project.teams.addToSet(team._id); await project.save();
  team.projects.addToSet(project._id); if (!team.project) team.project = project._id; await team.save();
  await recordProjectActivity({ project: project._id, actor: req.user._id, action: 'UPDATED', entityType: 'Project', entityId: project._id, title: `Đã liên kết Team ${team.key} với Project ${project.key}` });
  send(res, { projectId: project._id, teamId: team._id, linked: true });
};

const unlinkTeamFromProject = async (req, res) => {
  const project = await getById(Project, req.params.id);
  await assertProjectManager(project, req.user);
  const team = await getById(Team, req.params.teamId);
  project.teams.pull(team._id); await project.save();
  team.projects.pull(project._id); if (String(team.project) === String(project._id)) team.project = team.projects[0] || null; await team.save();
  send(res, { projectId: project._id, teamId: team._id, linked: false });
};

const listMemberships = async (req, res) => {
  const project = await getById(Project, req.params.id);
  const isMember = String(project.lead) === String(req.user._id) || await ProjectMembership.exists({ project: project._id, user: req.user._id, isActive: true });
  if (!isMember) throw new AppError('Bạn không thuộc Project này.', 403);
  const memberships = await ProjectMembership.find({ project: project._id, isActive: true })
    .populate('user', 'fullName email avatar status role')
    .populate('teams', 'name key color')
    .populate({ path: 'user', populate: { path: 'role', select: 'name' } })
    .sort('role joinedAt');
  send(res, memberships);
};

const updateMembership = async (req, res) => {
  const project = await getById(Project, req.params.id);
  await assertProjectManager(project, req.user);
  const membership = await ProjectMembership.findOne({ _id: req.params.membershipId, project: project._id, isActive: true });
  if (!membership) throw new AppError('Project Membership không tồn tại.', 404);
  if (String(project.lead) === String(membership.user) && req.body.role && req.body.role !== ROLE_NAMES.QA_MANAGER) {
    throw new AppError('Project Lead phải giữ vai trò QA Manager.', 409);
  }
  if (req.body.role !== undefined) {
    if (!INVITE_ROLES.includes(req.body.role)) throw new AppError('Vai trò Project không hợp lệ.', 400);
    membership.role = req.body.role;
  }
  if (req.body.teams !== undefined) {
    const teamIds = [...new Set((req.body.teams || []).map(String))];
    const validTeams = await Team.find({ _id: { $in: teamIds }, workspace: project.workspace, $or: [{ project: project._id }, { projects: project._id }] }).distinct('_id');
    if (validTeams.length !== teamIds.length) throw new AppError('Có Team không thuộc Project.', 400);
    if (validTeams.length) await Team.updateMany({ _id: { $in: validTeams } }, { $addToSet: { members: membership.user } });
    membership.teams = validTeams;
  }
  await membership.save();
  await membership.populate([{ path: 'user', select: 'fullName email avatar status role', populate: { path: 'role', select: 'name' } }, { path: 'teams', select: 'name key color' }]);
  send(res, membership);
};

const removeMembership = async (req, res) => {
  const project = await getById(Project, req.params.id);
  await assertProjectManager(project, req.user);
  const membership = await ProjectMembership.findOne({ _id: req.params.membershipId, project: project._id, isActive: true });
  if (!membership) throw new AppError('Project Membership không tồn tại.', 404);
  if (String(project.lead) === String(membership.user)) throw new AppError('Không thể xóa Project Lead. Hãy chuyển Lead trước.', 409);
  membership.isActive = false;
  membership.teams = [];
  project.members.pull(membership.user);
  await Promise.all([membership.save(), project.save()]);
  send(res, membership);
};

const listInvitations = async (req, res) => {
  const project = await getById(Project, req.params.id);
  await assertProjectManager(project, req.user);
  const invitations = await ProjectInvitation.find({ project: project._id })
    .populate('team', 'name key')
    .populate('invitedBy acceptedBy', 'fullName email')
    .sort('-createdAt');
  send(res, invitations);
};

const createInvitation = async (req, res) => {
  const project = await getById(Project, req.params.id);
  await assertProjectManager(project, req.user);
  const email = String(req.body.email || '').trim().toLowerCase();
  const role = req.body.role;
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new AppError('Email không hợp lệ.', 400);
  if (!INVITE_ROLES.includes(role)) throw new AppError('Vai trò lời mời không hợp lệ.', 400);
  let team = null;
  if (req.body.team) {
    team = await Team.findOne({ _id: req.body.team, workspace: project.workspace, $or: [{ project: project._id }, { projects: project._id }] });
    if (!team) throw new AppError('Team không thuộc Project đã chọn.', 400);
  }
  await ProjectInvitation.updateMany({ project: project._id, email, status: 'Pending' }, { status: 'Cancelled' });
  const rawToken = crypto.randomBytes(32).toString('hex');
  const invitation = await ProjectInvitation.create({
    email,
    workspace: project.workspace,
    project: project._id,
    team: team?._id || null,
    role,
    tokenHash: hashToken(rawToken),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    invitedBy: req.user._id,
  });
  const inviteUrl = await deliverInvitation({ invitation, inviter: req.user, project, team, rawToken });
  req._auditEntityId = invitation._id;
  req._auditAfter = invitation;
  await invitation.populate([{ path: 'team', select: 'name key' }, { path: 'invitedBy', select: 'fullName email' }]);
  send(res, { invitation, inviteUrl }, 201);
};

const getPublicInvitation = async (req, res) => {
  const invitation = await ProjectInvitation.findOne({ tokenHash: hashToken(req.params.token) })
    .populate('project', 'name key description')
    .populate('workspace', 'name logo')
    .populate('team', 'name key color')
    .populate('invitedBy', 'fullName email');
  if (!invitation) throw new AppError('Lời mời không tồn tại.', 404);
  if (invitation.status === 'Pending' && invitation.expiresAt <= new Date()) {
    invitation.status = 'Expired';
    await invitation.save();
  }
  send(res, invitation);
};

const acceptInvitation = async (req, res) => {
  const invitation = await ProjectInvitation.findOne({ tokenHash: hashToken(req.params.token) }).select('+tokenHash');
  if (!invitation) throw new AppError('Lời mời không tồn tại.', 404);
  if (invitation.status !== 'Pending') throw new AppError(`Lời mời đã ở trạng thái ${invitation.status}.`, 409);
  if (invitation.expiresAt <= new Date()) {
    invitation.status = 'Expired';
    await invitation.save();
    throw new AppError('Lời mời đã hết hạn.', 410);
  }
  const [project, workspace] = await Promise.all([Project.findById(invitation.project), Workspace.findById(invitation.workspace)]);
  if (!project || !workspace) throw new AppError('Project của lời mời không còn tồn tại.', 404);
  let user = await User.findOne({ email: invitation.email }).populate('role');
  if (!user) {
    if (!req.body.fullName || typeof req.body.password !== 'string' || req.body.password.length < 8) {
      throw new AppError('Họ tên và mật khẩu tối thiểu 8 ký tự là bắt buộc cho tài khoản mới.', 400);
    }
    const role = await Role.findOne({ name: ROLE_NAMES.USER, workspace: null });
    if (!role) throw new AppError('Vai trò hệ thống chưa được khởi tạo.', 500);
    user = await User.create({
      fullName: req.body.fullName,
      email: invitation.email,
      passwordHash: await bcrypt.hash(req.body.password, 12),
      role: role._id,
      workspace: workspace._id,
      isEmailVerified: true,
    });
    await user.populate('role');
  } else if (user.role?.name === ROLE_NAMES.SYSTEM_ADMIN) {
    throw new AppError('System Admin không thể tham gia Project. Hãy dùng tài khoản QA Manager, Tester hoặc Guest.', 409);
  }
  user.isEmailVerified = true;
  // A normal account keeps the system role "User".  Store the first joined
  // Workspace as its active context so a Project invitation immediately
  // appears in the member's Projects and approval screens after login.
  if (!user.workspace) user.workspace = workspace._id;
  project.members.addToSet(user._id);
  const operations = [
    user.save({ validateBeforeSave: false }),
    project.save(),
    WorkspaceMembership.updateOne(
      { workspace: workspace._id, user: user._id },
      { $set: { role: invitation.role, invitedBy: invitation.invitedBy, isActive: true, joinedAt: new Date() } },
      { upsert: true },
    ),
  ];
  if (invitation.team) operations.push(Team.updateOne({ _id: invitation.team }, { $addToSet: { members: user._id } }));
  await Promise.all(operations);
  await ProjectMembership.updateOne(
    { project: project._id, user: user._id },
    { $set: { role: invitation.role, invitedBy: invitation.invitedBy, isActive: true, joinedAt: new Date() }, ...(invitation.team ? { $addToSet: { teams: invitation.team } } : {}) },
    { upsert: true },
  );
  invitation.status = 'Accepted';
  invitation.acceptedBy = user._id;
  invitation.acceptedAt = new Date();
  await invitation.save();
  send(res, { project: { _id: project._id, name: project.name, key: project.key }, user: { _id: user._id, email: user.email, fullName: user.fullName }, requiresLogin: true });
};

const cancelInvitation = async (req, res) => {
  const invitation = await getById(ProjectInvitation, req.params.id);
  const project = await getById(Project, invitation.project);
  await assertProjectManager(project, req.user);
  if (invitation.status !== 'Pending') throw new AppError('Chỉ có thể hủy lời mời đang chờ.', 409);
  invitation.status = 'Cancelled';
  await invitation.save();
  send(res, invitation);
};

const resendInvitation = async (req, res) => {
  const invitation = await getById(ProjectInvitation, req.params.id);
  const project = await getById(Project, invitation.project);
  await assertProjectManager(project, req.user);
  if (!['Pending', 'Expired'].includes(invitation.status)) throw new AppError('Chỉ có thể gửi lại lời mời đang chờ hoặc đã hết hạn.', 409);
  const team = invitation.team ? await Team.findById(invitation.team) : null;
  const rawToken = crypto.randomBytes(32).toString('hex');
  invitation.tokenHash = hashToken(rawToken);
  invitation.status = 'Pending';
  invitation.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  invitation.emailDelivery = 'Pending';
  invitation.invitedBy = req.user._id;
  const inviteUrl = await deliverInvitation({ invitation, inviter: req.user, project, team, rawToken });
  await invitation.populate([{ path: 'team', select: 'name key' }, { path: 'invitedBy', select: 'fullName email' }]);
  send(res, { invitation, inviteUrl });
};

const myPendingInvitations = async (req, res) => {
  const invitations = await ProjectInvitation.find({ email: req.user.email, status: 'Pending', expiresAt: { $gt: new Date() } })
    .populate('project', 'name key')
    .populate('workspace', 'name')
    .populate('team', 'name key')
    .populate('invitedBy', 'fullName email')
    .sort('-createdAt');
  send(res, invitations);
};

const acceptInvitationById = async (req, res) => {
  const invitation = await ProjectInvitation.findById(req.params.id);
  if (!invitation) throw new AppError('Lời mời không tồn tại.', 404);
  if (invitation.email !== req.user.email) throw new AppError('Lời mời này không dành cho bạn.', 403);
  if (invitation.status !== 'Pending') throw new AppError(`Lời mời đã ở trạng thái ${invitation.status}.`, 409);
  if (invitation.expiresAt <= new Date()) {
    invitation.status = 'Expired';
    await invitation.save();
    throw new AppError('Lời mời đã hết hạn.', 410);
  }
  const [project, workspace] = await Promise.all([Project.findById(invitation.project), Workspace.findById(invitation.workspace)]);
  if (!project || !workspace) throw new AppError('Project của lời mời không còn tồn tại.', 404);
  const user = req.user;
  if (user.role?.name === ROLE_NAMES.SYSTEM_ADMIN) throw new AppError('System Admin không thể tham gia Project.', 409);
  user.isEmailVerified = true;
  if (!user.workspace) user.workspace = workspace._id;
  project.members.addToSet(user._id);
  const operations = [
    user.save({ validateBeforeSave: false }),
    project.save(),
    WorkspaceMembership.updateOne(
      { workspace: workspace._id, user: user._id },
      { $set: { role: invitation.role, invitedBy: invitation.invitedBy, isActive: true, joinedAt: new Date() } },
      { upsert: true },
    ),
  ];
  if (invitation.team) operations.push(Team.updateOne({ _id: invitation.team }, { $addToSet: { members: user._id } }));
  await Promise.all(operations);
  await ProjectMembership.updateOne(
    { project: project._id, user: user._id },
    { $set: { role: invitation.role, invitedBy: invitation.invitedBy, isActive: true, joinedAt: new Date() }, ...(invitation.team ? { $addToSet: { teams: invitation.team } } : {}) },
    { upsert: true },
  );
  invitation.status = 'Accepted';
  invitation.acceptedBy = user._id;
  invitation.acceptedAt = new Date();
  await invitation.save();
  send(res, { project: { _id: project._id, name: project.name, key: project.key }, accepted: true });
};

const listIntegrations = async (req, res) => {
  const allowed = req.allowedProjectIds || await accessibleProjectIds(req.user);
  if (allowed && req.query.project && !allowed.some((id) => String(id) === String(req.query.project))) throw new AppError('Bạn không thuộc Project này.', 403);
  const baseFilter = {
    ...(allowed ? { $or: [{ project: { $in: allowed } }, { project: null, workspace: req.user.workspace }] } : {}),
    ...(req.query.project ? { project: req.query.project } : {}),
  };
  const result = await list(IntegrationConnection, req, {
    baseFilter,
    filters: ['provider', 'status', 'workspace'],
    populate: [{ path: 'project', select: 'name key' }, { path: 'createdBy', select: 'fullName email' }],
  });
  send(res, result.data, 200, { pagination: result.pagination });
};

const createIntegration = async (req, res) => {
  const { provider, project: projectId } = req.body;
  if (!['Jira', 'GitHub', 'Linear'].includes(provider)) throw new AppError('Provider phải là Jira, GitHub hoặc Linear.', 400);
  let project = null;
  if (projectId) {
    project = await getById(Project, projectId);
    await assertProjectManager(project, req.user);
  } else {
    if (!req.body.workspace) throw new AppError('Workspace là bắt buộc cho tích hợp cấp Workspace.', 400);
    await assertWorkspaceAccess(req.user, req.body.workspace, { manage: true, permission: 'integration:manage' });
  }
  if (req.body.baseUrl) {
    let url;
    try { url = new URL(req.body.baseUrl); } catch { throw new AppError('Base URL không hợp lệ.', 400); }
    if (!['http:', 'https:'].includes(url.protocol)) throw new AppError('Base URL phải dùng HTTP hoặc HTTPS.', 400);
  }
  const credentialCiphertext = req.body.accessToken ? encryptCredential(req.body.accessToken) : null;
  const integration = await IntegrationConnection.create({
    provider,
    displayName: req.body.displayName || `${provider} integration`,
    workspace: project?.workspace || req.body.workspace,
    project: project?._id || null,
    baseUrl: req.body.baseUrl || '',
    externalProjectKey: req.body.externalProjectKey || '',
    settings: req.body.settings || {},
    syncConfig: req.body.syncConfig || undefined,
    retryPolicy: req.body.retryPolicy || undefined,
    credentialCiphertext,
    hasCredentials: Boolean(credentialCiphertext),
    status: 'Configured',
    createdBy: req.user._id,
  });
  const webhookSecret = await rotateWebhookSecret(integration);
  req._auditEntityId = integration._id;
  req._auditAfter = publicIntegration(integration);
  send(res, { integration: publicIntegration(integration), webhookSecret }, 201);
};

const updateIntegration = async (req, res) => {
  const integration = await getById(IntegrationConnection, req.params.id);
  if (integration.project) await assertProjectManager(await getById(Project, integration.project), req.user);
  else await assertWorkspaceAccess(req.user, integration.workspace, { manage: true, permission: 'integration:manage' });
  ['displayName', 'baseUrl', 'externalProjectKey', 'settings', 'status', 'syncConfig', 'retryPolicy'].forEach((key) => {
    if (req.body[key] !== undefined) integration[key] = req.body[key];
  });
  if (req.body.accessToken) {
    integration.credentialCiphertext = encryptCredential(req.body.accessToken);
    integration.hasCredentials = true;
  }
  await integration.save();
  send(res, publicIntegration(integration));
};

const testIntegration = async (req, res) => {
  const integration = await getById(IntegrationConnection, req.params.id);
  if (integration.project) await assertProjectManager(await getById(Project, integration.project), req.user);
  else await assertWorkspaceAccess(req.user, integration.workspace, { manage: true, permission: 'integration:manage' });
  const result = await testIntegrationConnection({ integrationId: integration._id, user: req.user });
  send(res, { connection: publicIntegration(result.connection), result: result.result, log: result.log });
};

const listIntegrationLogs = async (req, res) => {
  const integration = await getById(IntegrationConnection, req.params.id);
  if (integration.project) await assertProjectManager(await getById(Project, integration.project), req.user);
  else await assertWorkspaceAccess(req.user, integration.workspace, { manage: true, permission: 'integration:manage' });
  const result = await list(IntegrationSyncLog, req, {
    baseFilter: { integration: integration._id },
    filters: ['status', 'action', 'direction'],
    populate: { path: 'initiatedBy', select: 'fullName email' },
  });
  send(res, result.data, 200, { pagination: result.pagination });
};

const rotateIntegrationWebhook = async (req, res) => {
  const integration = await IntegrationConnection.findById(req.params.id).select('+webhookSecretCiphertext');
  if (!integration) throw new AppError('Integration không tồn tại.', 404);
  if (integration.project) await assertProjectManager(await getById(Project, integration.project), req.user);
  else await assertWorkspaceAccess(req.user, integration.workspace, { manage: true, permission: 'integration:manage' });
  const webhookSecret = await rotateWebhookSecret(integration);
  send(res, { integration: publicIntegration(integration), webhookSecret });
};

const deleteIntegration = async (req, res) => {
  const integration = await getById(IntegrationConnection, req.params.id);
  if (integration.project) await assertProjectManager(await getById(Project, integration.project), req.user);
  else await assertWorkspaceAccess(req.user, integration.workspace, { manage: true, permission: 'integration:manage' });
  await integration.deleteOne();
  send(res, { _id: integration._id });
};

module.exports = {
  listTeams, createTeam, updateTeam, archiveTeam, linkTeamToProject, unlinkTeamFromProject, listMemberships, updateMembership, removeMembership,
  listInvitations, createInvitation, getPublicInvitation, acceptInvitation, cancelInvitation, resendInvitation,
  myPendingInvitations, acceptInvitationById,
  listIntegrations, createIntegration, updateIntegration, deleteIntegration,
  testIntegration, listIntegrationLogs, rotateIntegrationWebhook,
};
