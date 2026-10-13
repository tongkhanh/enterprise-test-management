/**
 * ============================================================
 * MIDDLEWARE: PHÂN QUYỀN ROLE-BASED ACCESS CONTROL (RBAC)
 * ============================================================
 * Mô hình Linear-style:
 * - System_Admin: chỉ có quyền quản trị hệ thống
 * - User: toàn quyền nghiệp vụ; khi ở trong workspace khác,
 *   quyền bị giới hạn bởi WorkspaceMembership role
 *
 * Cách sử dụng trong routes:
 *   router.post('/bugs', protect, authorize('bug:create'), createBug);
 *   router.put('/test-cases/:id/approve', protect, authorize('testcase:approve'), approveTestCase);
 * ============================================================
 */

const { Role, Workspace, WorkspaceMembership, Project } = require('../models');
const { ROLE_NAMES } = require('../config/roles');
const { getWorkspaceRole, workspaceRoleHasPermission, resolveWorkspaceIdFromRequest, reconcileAcceptedInvitationMemberships } = require('../services/workspaceAccessService');

/**
 * Middleware phân quyền
 * @param  {...string} requiredPermissions - Danh sách permissions cần có (ít nhất 1)
 * Ví dụ: authorize('bug:create', 'bug:update')
 * → User chỉ cần có MỘT TRONG các quyền trên là đủ (OR logic)
 *
 * Logic:
 * 1. System_Admin → chỉ check quyền hệ thống (system:*)
 * 2. User + có workspace context → check quyền qua workspace role
 * 3. User + không có workspace context → check quyền từ system role (cho phép)
 */
const authorize = (...requiredPermissions) => {
  return async (req, res, next) => {
    try {
      // 1. Kiểm tra user đã xác thực chưa
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Vui lòng đăng nhập trước.'
        });
      }

      // 2. Lấy role của user (đã populate ở auth middleware)
      let userRole = req.user.role;

      // Nếu role chưa được populate, truy vấn từ DB
      if (!userRole || typeof userRole === 'string' || !userRole.permissions) {
        userRole = await Role.findById(req.user.role);
      }

      if (!userRole) {
        return res.status(403).json({
          success: false,
          error: 'Vai trò của bạn không tồn tại trong hệ thống.'
        });
      }

      let hasPermission = false;

      // 3. System Admin: chỉ check quyền hệ thống, không tham gia nghiệp vụ
      if (userRole.name === ROLE_NAMES.SYSTEM_ADMIN) {
        hasPermission = requiredPermissions.some(permission =>
          userRole.permissions.includes(permission)
        );
      } else {
        // 4. User thường: ưu tiên check qua workspace membership
        const workspaceId = await resolveWorkspaceIdFromRequest(req);

        if (workspaceId) {
          // Có workspace context → lấy role trong workspace đó
          const workspaceRole = await getWorkspaceRole(req.user, workspaceId);
          req.workspaceRole = workspaceRole;
          req.workspaceId = workspaceId;

          if (workspaceRole) {
            // User là thành viên workspace → check quyền theo workspace role
            hasPermission = requiredPermissions.some(permission =>
              workspaceRoleHasPermission(workspaceRole, permission)
            );
          }
          // Nếu không phải thành viên workspace → hasPermission = false
        } else {
          // Không có workspace context (vd: workspace:create, workspace:read)
          // → check quyền từ system role (User có đầy đủ quyền nghiệp vụ)
          hasPermission = userRole.permissions.includes('*') || requiredPermissions.some(permission =>
            userRole.permissions.includes(permission)
          );
        }
      }

      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          error: `Bạn không có quyền thực hiện hành động này. Yêu cầu quyền: ${requiredPermissions.join(' hoặc ')}`
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Middleware kiểm tra vai trò cụ thể
 * @param  {...string} roleNames - Danh sách tên vai trò cho phép
 * Ví dụ: authorizeRoles('System_Admin', 'QA_Manager')
 */
const authorizeRoles = (...roleNames) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Vui lòng đăng nhập trước.'
        });
      }

      let userRole = req.user.role;
      if (!userRole || typeof userRole === 'string' || !userRole.name) {
        userRole = await Role.findById(req.user.role);
      }

      if (!userRole || !roleNames.includes(userRole.name)) {
        return res.status(403).json({
          success: false,
          error: `Chỉ ${roleNames.join(', ')} mới có quyền thực hiện hành động này.`
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Cấp scope đọc cho API danh sách. Controller bắt buộc dùng
 * req.allowedWorkspaceIds/req.allowedProjectIds làm baseFilter.
 *
 * Chỉ trả về dữ liệu từ workspace mà user là thành viên.
 */
const authorizeWorkspaceList = (...requiredPermissions) => async (req, res, next) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, error: 'Vui lòng đăng nhập trước.' });
    const roleName = req.user.role?.name || req.user.role;
    if (roleName === ROLE_NAMES.SYSTEM_ADMIN) {
      return res.status(403).json({ success: false, error: 'System Admin không truy cập dữ liệu nghiệp vụ Workspace.' });
    }
    // Repair any legacy/partial Accepted invitation before deriving the list
    // scope. Without this, an empty membership list prevents the controller
    // from ever reaching the reconciliation logic.
    await reconcileAcceptedInvitationMemberships(req.user);
    const [owned, memberships] = await Promise.all([
      Workspace.find({ owner: req.user._id, isActive: true }).select('_id'),
      WorkspaceMembership.find({ user: req.user._id, isActive: true }).select('workspace role'),
    ]);
    const roleByWorkspace = new Map(memberships.map((item) => [String(item.workspace), item.role]));
    owned.forEach((workspace) => roleByWorkspace.set(String(workspace._id), ROLE_NAMES.OWNER));
    const allowedWorkspaceIds = [...roleByWorkspace.entries()]
      .filter(([, workspaceRole]) => requiredPermissions.some((permission) => workspaceRoleHasPermission(workspaceRole, permission)))
      .map(([workspaceId]) => workspaceId);
    req.allowedWorkspaceIds = allowedWorkspaceIds;
    req.allowedProjectIds = (await Project.find({ workspace: { $in: allowedWorkspaceIds } }).distinct('_id')).map(String);
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { authorize, authorizeRoles, authorizeWorkspaceList };
