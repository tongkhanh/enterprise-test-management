const { Project, ProjectMembership } = require('../models');
const { AppError, assertObjectId } = require('../utils/http');
const { ROLE_NAMES } = require('../config/roles');
const { assertWorkspaceAccess, getAccessibleWorkspaceIds } = require('./workspaceAccessService');

const roleNameOf = (user) => user?.role?.name || user?.role;

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
  const membership = await ProjectMembership.findOne({ project: project._id, user: user._id, isActive: true });
  return { project, membership, workspaceRole: workspaceAccess.role };
};

module.exports = { getAccessibleProjectIds, assertProjectAccess, roleNameOf };
