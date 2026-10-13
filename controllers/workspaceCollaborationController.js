const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { Workspace, WorkspaceMembership, WorkspaceInvitation, User, Role } = require('../models');
const { AppError, getById, send } = require('../utils/http');
const { sendWorkspaceInvitationEmail } = require('../services/emailService');
const { assertWorkspaceAccess } = require('../services/workspaceAccessService');
const { ROLE_NAMES, INVITABLE_WORKSPACE_ROLE_NAMES } = require('../config/roles');

const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
const inviteUrl = (rawToken) => `${String(process.env.APP_BASE_URL || 'http://localhost:5000/studio').replace(/\/$/, '')}/accept-invite?type=workspace&token=${encodeURIComponent(rawToken)}`;

const deliver = async ({ invitation, inviter, workspace, rawToken }) => {
  const url = inviteUrl(rawToken);
  try {
    const result = await sendWorkspaceInvitationEmail({ invitation, inviter, workspace, inviteUrl: url });
    invitation.emailDelivery = result.delivered ? 'Sent' : 'Skipped';
  } catch {
    invitation.emailDelivery = 'Failed';
  }
  await invitation.save();
  return url;
};

const listMemberships = async (req, res) => {
  await assertWorkspaceAccess(req.user, req.params.id, { permission: 'member:read' });
  const memberships = await WorkspaceMembership.find({ workspace: req.params.id, isActive: true })
    .populate('user', 'fullName email avatar status')
    .populate('invitedBy', 'fullName email')
    .sort('role joinedAt');
  send(res, memberships);
};

const updateMembership = async (req, res) => {
  const { workspace, role: actorRole } = await assertWorkspaceAccess(req.user, req.params.id, { roles: [ROLE_NAMES.OWNER, ROLE_NAMES.QA_MANAGER] });
  const membership = await WorkspaceMembership.findOne({ _id: req.params.membershipId, workspace: workspace._id, isActive: true });
  if (!membership) throw new AppError('Workspace Membership không tồn tại.', 404);
  if (membership.role === ROLE_NAMES.OWNER || String(membership.user) === String(workspace.owner)) throw new AppError('Không thể thay đổi vai trò Owner.', 409);
  if (!INVITABLE_WORKSPACE_ROLE_NAMES.includes(req.body.role)) throw new AppError('Vai trò Workspace không hợp lệ.', 400);
  membership.role = req.body.role;
  await membership.save();
  await membership.populate('user', 'fullName email avatar status');
  send(res, membership, 200, { actorRole });
};

const removeMembership = async (req, res) => {
  const { workspace } = await assertWorkspaceAccess(req.user, req.params.id, { roles: [ROLE_NAMES.OWNER, ROLE_NAMES.QA_MANAGER] });
  const membership = await WorkspaceMembership.findOne({ _id: req.params.membershipId, workspace: workspace._id, isActive: true });
  if (!membership) throw new AppError('Workspace Membership không tồn tại.', 404);
  if (membership.role === ROLE_NAMES.OWNER || String(membership.user) === String(workspace.owner)) throw new AppError('Không thể xóa Owner khỏi Workspace.', 409);
  membership.isActive = false;
  await membership.save();
  send(res, membership);
};

const listInvitations = async (req, res) => {
  await assertWorkspaceAccess(req.user, req.params.id, { roles: [ROLE_NAMES.OWNER, ROLE_NAMES.QA_MANAGER] });
  const invitations = await WorkspaceInvitation.find({ workspace: req.params.id })
    .populate('invitedBy acceptedBy', 'fullName email')
    .sort('-createdAt');
  send(res, invitations);
};

const createInvitation = async (req, res) => {
  const { workspace } = await assertWorkspaceAccess(req.user, req.params.id, { roles: [ROLE_NAMES.OWNER, ROLE_NAMES.QA_MANAGER] });
  const email = String(req.body.email || '').trim().toLowerCase();
  const role = req.body.role;
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new AppError('Email không hợp lệ.', 400);
  if (!INVITABLE_WORKSPACE_ROLE_NAMES.includes(role)) throw new AppError('Vai trò lời mời không hợp lệ.', 400);
  const activeCount = await WorkspaceMembership.countDocuments({ workspace: workspace._id, isActive: true });
  if (activeCount >= workspace.maxMembers) throw new AppError(`Workspace đã đạt giới hạn ${workspace.maxMembers} thành viên.`, 409);
  await WorkspaceInvitation.updateMany({ workspace: workspace._id, email, status: 'Pending' }, { status: 'Cancelled' });
  const rawToken = crypto.randomBytes(32).toString('hex');
  const invitation = await WorkspaceInvitation.create({
    email, workspace: workspace._id, role, tokenHash: hashToken(rawToken),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), invitedBy: req.user._id,
  });
  const url = await deliver({ invitation, inviter: req.user, workspace, rawToken });
  await invitation.populate('invitedBy', 'fullName email');
  send(res, { invitation, inviteUrl: url }, 201);
};

const getPublicInvitation = async (req, res) => {
  const invitation = await WorkspaceInvitation.findOne({ tokenHash: hashToken(req.params.token) })
    .populate('workspace', 'name logo description')
    .populate('invitedBy', 'fullName email');
  if (!invitation) throw new AppError('Lời mời Workspace không tồn tại.', 404);
  if (invitation.status === 'Pending' && invitation.expiresAt <= new Date()) {
    invitation.status = 'Expired'; await invitation.save();
  }
  send(res, invitation);
};

const acceptInvitation = async (req, res) => {
  const invitation = await WorkspaceInvitation.findOne({ tokenHash: hashToken(req.params.token) }).select('+tokenHash');
  if (!invitation) throw new AppError('Lời mời Workspace không tồn tại.', 404);
  if (invitation.status !== 'Pending') throw new AppError(`Lời mời đã ở trạng thái ${invitation.status}.`, 409);
  if (invitation.expiresAt <= new Date()) { invitation.status = 'Expired'; await invitation.save(); throw new AppError('Lời mời đã hết hạn.', 410); }
  const workspace = await Workspace.findById(invitation.workspace);
  if (!workspace) throw new AppError('Workspace không còn tồn tại.', 404);
  let user = await User.findOne({ email: invitation.email }).populate('role');
  if (!user) {
    if (!req.body.fullName || typeof req.body.password !== 'string' || req.body.password.length < 8) throw new AppError('Họ tên và mật khẩu tối thiểu 8 ký tự là bắt buộc.', 400);
    const userRole = await Role.findOne({ name: ROLE_NAMES.USER, workspace: null });
    if (!userRole) throw new AppError('Vai trò User chưa được khởi tạo.', 500);
    user = await User.create({ fullName: req.body.fullName, email: invitation.email, passwordHash: await bcrypt.hash(req.body.password, 12), role: userRole._id, isEmailVerified: true });
  } else if (user.role?.name === ROLE_NAMES.SYSTEM_ADMIN) {
    throw new AppError('System Admin không tham gia Workspace nghiệp vụ.', 409);
  }
  await WorkspaceMembership.updateOne(
    { workspace: workspace._id, user: user._id },
    { $set: { role: invitation.role, invitedBy: invitation.invitedBy, isActive: true, joinedAt: new Date() } },
    { upsert: true },
  );
  invitation.status = 'Accepted'; invitation.acceptedBy = user._id; invitation.acceptedAt = new Date();
  await invitation.save();
  send(res, { workspace: { _id: workspace._id, name: workspace.name }, user: { _id: user._id, email: user.email, fullName: user.fullName }, role: invitation.role, requiresLogin: true });
};

// Hộp thư trong app: không gửi token bí mật về client. User đã đăng nhập
// chỉ có thể thấy và chấp nhận lời mời đúng email của mình.
const myPendingInvitations = async (req, res) => {
  const invitations = await WorkspaceInvitation.find({
    email: req.user.email,
    status: 'Pending',
    expiresAt: { $gt: new Date() },
  })
    .populate('workspace', 'name logo description')
    .populate('invitedBy', 'fullName email')
    .sort('-createdAt');
  send(res, invitations);
};

const acceptInvitationById = async (req, res) => {
  const invitation = await WorkspaceInvitation.findById(req.params.id);
  if (!invitation) throw new AppError('Lời mời Workspace không tồn tại.', 404);
  if (invitation.email !== req.user.email) throw new AppError('Lời mời này không dành cho bạn.', 403);
  if (invitation.status !== 'Pending') throw new AppError(`Lời mời đã ở trạng thái ${invitation.status}.`, 409);
  if (invitation.expiresAt <= new Date()) {
    invitation.status = 'Expired';
    await invitation.save();
    throw new AppError('Lời mời đã hết hạn.', 410);
  }
  if (req.user.role?.name === ROLE_NAMES.SYSTEM_ADMIN) throw new AppError('System Admin không tham gia Workspace nghiệp vụ.', 409);
  const workspace = await Workspace.findById(invitation.workspace);
  if (!workspace) throw new AppError('Workspace không còn tồn tại.', 404);
  await WorkspaceMembership.updateOne(
    { workspace: workspace._id, user: req.user._id },
    { $set: { role: invitation.role, invitedBy: invitation.invitedBy, isActive: true, joinedAt: new Date() } },
    { upsert: true },
  );
  invitation.status = 'Accepted';
  invitation.acceptedBy = req.user._id;
  invitation.acceptedAt = new Date();
  await invitation.save();
  send(res, { workspace: { _id: workspace._id, name: workspace.name }, role: invitation.role, accepted: true });
};

module.exports = { listMemberships, updateMembership, removeMembership, listInvitations, createInvitation, getPublicInvitation, acceptInvitation, myPendingInvitations, acceptInvitationById };
