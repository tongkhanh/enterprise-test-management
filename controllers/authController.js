const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { UAParser } = require('ua-parser-js');
const {
  User,
  Role,
  UserSession,
  AuditLog,
  Workspace,
  Project,
  WorkspaceMembership,
  ProjectMembership,
  ProjectInvitation,
} = require('../models');
const { AppError, list, send } = require('../utils/http');
const { ROLE_NAMES, ROLE_DEFINITIONS, LEGACY_ROLE_MAP } = require('../config/roles');

const ensureRoles = async () => {
  await Promise.all(Object.entries(ROLE_DEFINITIONS).map(([name, permissions]) =>
    Role.updateOne(
      { name, workspace: null },
      {
        $set: { permissions, description: `Vai trò hệ thống ${name}`, isSystemRole: true },
        $setOnInsert: { name, workspace: null },
      },
      { upsert: true }
    )
  ));

  const currentRoles = await Role.find({ workspace: null });
  const byName = new Map(currentRoles.map((role) => [role.name, role]));
  for (const [legacyName, targetName] of Object.entries(LEGACY_ROLE_MAP)) {
    const legacyRoles = await Role.find({ name: legacyName });
    const targetRole = byName.get(targetName);
    if (legacyRoles.length && targetRole) {
      const legacyRoleIds = legacyRoles.map((role) => role._id);

      // Admin cũ có sở hữu workspace/project là vai trò nghiệp vụ, không phải
      // quản trị hệ thống. Giữ quyền quản lý dữ liệu bằng cách chuyển
      // nhóm này sang QA_Manager; Admin không sở hữu dữ liệu mới sang System_Admin.
      if (legacyName === 'Admin') {
        const legacyUsers = await User.find({ role: { $in: legacyRoleIds } }).select('_id');
        const legacyUserIds = legacyUsers.map((user) => user._id);
        const [workspaceOwners, projectLeads] = await Promise.all([
          Workspace.distinct('owner', { owner: { $in: legacyUserIds } }),
          Project.distinct('lead', { lead: { $in: legacyUserIds } }),
        ]);
        const businessManagerIds = [...new Set([...workspaceOwners, ...projectLeads].map(String))];
        const userRole = byName.get(ROLE_NAMES.USER);

        if (businessManagerIds.length && userRole) {
          await User.updateMany(
            { _id: { $in: businessManagerIds }, role: { $in: legacyRoleIds } },
            { role: userRole._id }
          );
        }
        await User.updateMany({ role: { $in: legacyRoleIds } }, { role: targetRole._id });
      } else {
        await User.updateMany({ role: { $in: legacyRoleIds } }, { role: targetRole._id });
      }
    }
  }

  await Promise.all([
    ProjectMembership.updateMany({ role: { $in: ['Admin', 'PM', 'QA_Lead'] } }, { role: ROLE_NAMES.QA_MANAGER }),
    ProjectMembership.updateMany({ role: 'Developer' }, { role: ROLE_NAMES.TESTER }),
    ProjectInvitation.updateMany({ role: { $in: ['Admin', 'PM', 'QA_Lead'] } }, { role: ROLE_NAMES.QA_MANAGER }),
    ProjectInvitation.updateMany({ role: 'Developer' }, { role: ROLE_NAMES.TESTER }),
  ]);

  // Chuyển quyền nghiệp vụ cũ sang membership theo Workspace.
  const workspaces = await Workspace.find().select('owner');
  await Promise.all(workspaces.map((workspace) => WorkspaceMembership.updateOne(
    { workspace: workspace._id, user: workspace.owner },
    { $set: { role: ROLE_NAMES.OWNER, isActive: true, joinedAt: new Date() } },
    { upsert: true },
  )));
  const projects = await Project.find().select('workspace lead');
  for (const project of projects) {
    const memberships = await ProjectMembership.find({ project: project._id, isActive: true }).select('user role invitedBy joinedAt');
    for (const membership of memberships) {
      const isOwner = workspaces.some((workspace) => String(workspace._id) === String(project.workspace) && String(workspace.owner) === String(membership.user));
      const workspaceRole = isOwner ? ROLE_NAMES.OWNER : membership.role;
      const existing = await WorkspaceMembership.findOne({ workspace: project.workspace, user: membership.user });
      const weight = { Guest: 1, Tester: 2, QA_Manager: 3, Owner: 4 };
      if (!existing || (weight[workspaceRole] || 0) > (weight[existing.role] || 0)) {
        await WorkspaceMembership.updateOne(
          { workspace: project.workspace, user: membership.user },
          { $set: { role: workspaceRole, invitedBy: membership.invitedBy, isActive: true, joinedAt: membership.joinedAt || new Date() } },
          { upsert: true },
        );
      }
    }
  }

  await Role.deleteMany({ name: { $in: Object.keys(LEGACY_ROLE_MAP) } });
};

const publicUser = (user) => {
  const value = user.toObject ? user.toObject() : { ...user };
  delete value.passwordHash;
  return value;
};

const register = async (req, res) => {
  const { fullName, email, password } = req.body;
  if (!fullName || !email || typeof password !== 'string' || password.length < 8) {
    throw new AppError('Họ tên, email và mật khẩu tối thiểu 8 ký tự là bắt buộc.', 400);
  }
  await ensureRoles();
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) throw new AppError('Email đã được sử dụng.', 409);
  const isFirstUser = (await User.countDocuments()) === 0;
  const role = await Role.findOne({ name: isFirstUser ? ROLE_NAMES.SYSTEM_ADMIN : ROLE_NAMES.USER, workspace: null });
  const user = await User.create({
    fullName,
    email: email.toLowerCase(),
    passwordHash: await bcrypt.hash(password, 12),
    role: role._id,
  });
  await user.populate('role');
  send(res, publicUser(user), 201, { message: isFirstUser ? 'Tài khoản quản trị đầu tiên đã được tạo.' : 'Đăng ký thành công.' });
};

const login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throw new AppError('Email và mật khẩu là bắt buộc.', 400);
  if (!process.env.JWT_SECRET) throw new AppError('Máy chủ chưa cấu hình JWT_SECRET.', 500);
  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash').populate('role');
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new AppError('Email hoặc mật khẩu không đúng.', 401);
  }
  if (user.status !== 'active') throw new AppError('Tài khoản đang bị khóa hoặc vô hiệu hóa.', 403);

  const parsed = new UAParser(req.headers['user-agent'] || '').getResult();
  const session = await UserSession.create({
    user: user._id,
    token: 'pending',
    ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
    deviceName: parsed.device.model || parsed.device.type || 'Desktop',
    browser: [parsed.browser.name, parsed.browser.version].filter(Boolean).join(' '),
    os: [parsed.os.name, parsed.os.version].filter(Boolean).join(' '),
    userAgent: req.headers['user-agent'] || '',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
  const token = jwt.sign({ id: user._id, sessionId: session._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
  const decoded = jwt.decode(token);
  session.token = token;
  session.expiresAt = new Date(decoded.exp * 1000);
  await session.save();
  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });
  await AuditLog.create({ performedBy: user._id, workspace: user.workspace, action: 'LOGIN', entityType: 'UserSession', entityId: session._id, ipAddress: session.ipAddress, userAgent: session.userAgent });
  send(res, { token, user: publicUser(user), sessionId: session._id });
};

const logout = async (req, res) => {
  const session = await UserSession.findOneAndUpdate(
    { _id: req.sessionId, user: req.user._id },
    { isActive: false, logoutAt: new Date() },
    { new: true }
  );
  if (session) await AuditLog.create({ performedBy: req.user._id, workspace: req.user.workspace, action: 'LOGOUT', entityType: 'UserSession', entityId: session._id, ipAddress: req.ip, userAgent: req.headers['user-agent'] });
  send(res, null, 200, { message: 'Đã đăng xuất.' });
};

const me = async (req, res) => {
  // A system role is intentionally only "User" for normal accounts.  Surface
  // the role of their primary Workspace as well, so clients can render
  // Workspace-scoped actions immediately after an invitation is accepted.
  const user = publicUser(req.user);
  // All business authority belongs to Workspace membership, not the
  // account's system role.  Existing accounts invited directly to a Project
  // may not yet have a primary workspace recorded, so fall back to any active
  // membership instead of reporting them as a plain "User".
  const membership = user.workspace
    ? await WorkspaceMembership.findOne({ workspace: user.workspace, user: req.user._id, isActive: true }).select('role workspace')
    : await WorkspaceMembership.findOne({ user: req.user._id, isActive: true }).sort('joinedAt').select('role workspace');
  const currentWorkspaceRole = membership?.role || null;
  send(res, { ...user, workspace: user.workspace || membership?.workspace || null, currentWorkspaceRole });
};

const updateProfile = async (req, res) => {
  const allowed = ['fullName', 'avatar', 'phone'];
  for (const key of allowed) if (req.body[key] !== undefined) req.user[key] = req.body[key];
  if (req.body.password) {
    if (req.body.password.length < 8) throw new AppError('Mật khẩu phải có ít nhất 8 ký tự.', 400);
    if (!req.body.currentPassword) throw new AppError('Cần nhập mật khẩu hiện tại để đổi mật khẩu.', 400);
    const account = await User.findById(req.user._id).select('+passwordHash');
    if (!account || !(await bcrypt.compare(req.body.currentPassword, account.passwordHash))) throw new AppError('Mật khẩu hiện tại không đúng.', 401);
    req.user.passwordHash = await bcrypt.hash(req.body.password, 12);
  }
  await req.user.save();
  send(res, publicUser(req.user));
};

const sessions = async (req, res) => {
  const data = await UserSession.find({ user: req.user._id }).sort('-lastActivityAt').select('-token -refreshToken');
  send(res, data.map((item) => ({ ...item.toObject(), isCurrent: item._id.equals(req.sessionId) })));
};

const revokeSession = async (req, res) => {
  const session = await UserSession.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { isActive: false, logoutAt: new Date() },
    { new: true }
  );
  if (!session) throw new AppError('Phiên đăng nhập không tồn tại.', 404);
  send(res, { id: session._id }, 200, { message: 'Đã đăng xuất thiết bị từ xa.' });
};

const revokeOtherSessions = async (req, res) => {
  const result = await UserSession.updateMany(
    { user: req.user._id, _id: { $ne: req.sessionId }, isActive: true },
    { isActive: false, logoutAt: new Date() }
  );
  send(res, { revoked: result.modifiedCount });
};

const auditLogs = async (req, res) => {
  const result = await list(AuditLog, req, {
    baseFilter: req.user.role?.name === ROLE_NAMES.SYSTEM_ADMIN ? {} : { workspace: req.user.workspace },
    filters: ['action', 'entityType', 'performedBy'],
    populate: { path: 'performedBy', select: 'fullName email' },
  });
  send(res, result.data, 200, { pagination: result.pagination });
};

const listUsers = async (req, res) => {
  const result = await list(User, req, { filters: ['workspace', 'status', 'role'], searchFields: ['fullName', 'email'], populate: { path: 'role', select: 'name permissions' } });
  send(res, result.data, 200, { pagination: result.pagination });
};

const updateUserAccess = async (req, res) => {
  const user = await User.findById(req.params.id).populate('role');
  if (!user) throw new AppError('Người dùng không tồn tại.', 404);
  req._auditBefore = publicUser(user);
  ['role', 'status', 'workspace'].forEach((key) => { if (req.body[key] !== undefined) user[key] = req.body[key]; });
  await user.save({ validateBeforeSave: false });
  if (req.body.status && req.body.status !== 'active') await UserSession.updateMany({ user: user._id, isActive: true }, { isActive: false, logoutAt: new Date() });
  await user.populate('role');
  send(res, publicUser(user));
};

const listRoles = async (req, res) => send(res, await Role.find({ $or: [{ workspace: req.user.workspace }, { workspace: null }] }).sort('name'));

const updateRole = async (req, res) => {
  const role = await Role.findById(req.params.id);
  if (!role) throw new AppError('Vai trò không tồn tại.', 404);
  req._auditBefore = role.toObject();
  if (req.body.permissions) role.permissions = [...new Set(req.body.permissions)];
  if (req.body.description !== undefined) role.description = req.body.description;
  await role.save();
  send(res, role);
};

module.exports = { ensureRoles, register, login, logout, me, updateProfile, sessions, revokeSession, revokeOtherSessions, auditLogs, listUsers, updateUserAccess, listRoles, updateRole };
