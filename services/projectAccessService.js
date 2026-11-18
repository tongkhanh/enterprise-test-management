const { Project, ProjectMembership, ProjectInvitation } = require('../models');
const { AppError, assertObjectId } = require('../utils/http');
const { ROLE_NAMES } = require('../config/roles');
const { assertWorkspaceAccess, getAccessibleWorkspaceIds } = require('./workspaceAccessService');

const roleNameOf = (user) => user?.role?.name || user?.role;
const recoverableProjectRole = ({ existingMembership, acceptedInvitation, isListedMember, workspaceRole }) => {
  if (existingMembership?.isActive) return existingMembership.role;
  // An inactive row with no denormalized Project membership is an explicit
  // removal. A historical Accepted invitation must not silently re-add it.
  if (existingMembership && !isListedMember) return null;
  if (!acceptedInvitation && !isListedMember) return null;
  if (existingMembership?.role) return existingMembership.role;
  if (acceptedInvitation?.role) return acceptedInvitation.role;
  if ([ROLE_NAMES.BUSINESS_OWNER, ROLE_NAMES.QA].includes(workspaceRole)) return workspaceRole;
  return 'Guest';
};

const recoverProjectMembership = async ({ user, project, workspaceRole }) => {
  const existingMembership = await ProjectMembership.findOne({ project: project._id, user: user._id });
  if (existingMembership?.isActive) return existingMembership;
  const email = String(user.email || '').trim().toLowerCase();
  const acceptedInvitation = await ProjectInvitation.findOne({
    project: project._id,
    status: 'Accepted',
    $or: [
      { acceptedBy: user._id },
      ...(email ? [{ email }] : []),
    ],
  }).sort('-acceptedAt');
  const isListedMember = (project.members || []).some((memberId) => String(memberId) === String(user._id));
  const role = recoverableProjectRole({ existingMembership, acceptedInvitation, isListedMember, workspaceRole });
  if (!role) return null;
  const membership = await ProjectMembership.findOneAndUpdate(
    { project: project._id, user: user._id },
    {
      $set: { role, isActive: true },
      $setOnInsert: {
        invitedBy: acceptedInvitation?.invitedBy || null,
        joinedAt: acceptedInvitation?.acceptedAt || new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  if (!isListedMember) await Project.updateOne({ _id: project._id }, { $addToSet: { members: user._id } });
  return membership;
};

const getAccessibleProjectIds = async (user) => {
  if (roleNameOf(user) === ROLE_NAMES.SYSTEM_ADMIN) return [];
  const workspaceIds = await getAccessibleWorkspaceIds(user);
  return (await Project.find({ workspace: { $in: workspaceIds } }).distinct('_id')).map(String);
};

const assertProjectAccess = async (user, projectId, options = {}) => {
  assertObjectId(projectId, 'Project ID');
  const project = await Project.findById(projectId);
  if (!project) throw new AppError('Project không tồn tại.', 404);
  if (roleNameOf(user) === ROLE_NAMES.SYSTEM_ADMIN) {
    throw new AppError('System Admin chỉ quản trị hệ thống, không truy cập nghiệp vụ Project.', 403);
  }

  const workspaceAccess = await assertWorkspaceAccess(user, project.workspace, {
    manage: Boolean(options.manage),
    permission: options.permission,
  });
  const membership = await recoverProjectMembership({ user, project, workspaceRole: workspaceAccess.role });
  return { project, membership, workspaceRole: workspaceAccess.role };
};

module.exports = { getAccessibleProjectIds, assertProjectAccess, roleNameOf, recoverableProjectRole };
