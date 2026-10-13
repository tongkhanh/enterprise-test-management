const ROLE_NAMES = Object.freeze({
  SYSTEM_ADMIN: 'System_Admin',
  USER: 'User',
  OWNER: 'Owner',
  QA_MANAGER: 'QA_Manager',
  TESTER: 'Tester',
  GUEST: 'Guest',
});

// ============================================================
// CẤP HỆ THỐNG: Chỉ 2 role
// - System_Admin: quản trị hệ thống (user, role, audit, settings)
// - User: tài khoản thông thường, toàn quyền nghiệp vụ
// ============================================================
const SYSTEM_ROLE_NAMES = Object.freeze([
  ROLE_NAMES.SYSTEM_ADMIN,
  ROLE_NAMES.USER,
]);

// ============================================================
// CẤP WORKSPACE: Phân quyền khi được mời vào workspace khác
// - Owner: toàn quyền (người tạo workspace tự động là Owner)
// - QA_Manager: quản lý workspace/project/team/cycle + phê duyệt
// - Tester: thực hiện tác vụ test (không phê duyệt)
// - Guest: chỉ xem
// ============================================================
const WORKSPACE_ROLE_NAMES = Object.freeze([
  ROLE_NAMES.OWNER,
  ROLE_NAMES.QA_MANAGER,
  ROLE_NAMES.TESTER,
  ROLE_NAMES.GUEST,
]);
const INVITABLE_WORKSPACE_ROLE_NAMES = Object.freeze([
  ROLE_NAMES.QA_MANAGER,
  ROLE_NAMES.TESTER,
  ROLE_NAMES.GUEST,
]);
const PROJECT_ROLE_NAMES = Object.freeze([
  ROLE_NAMES.QA_MANAGER,
  ROLE_NAMES.TESTER,
  ROLE_NAMES.GUEST,
]);

// ============================================================
// QUYỀN THEO ROLE
// ============================================================

// ETMS dùng vai trò để mô tả trách nhiệm trong quy trình (người tạo, người
// kiểm thử, người duyệt), không để che chức năng. Mọi thành viên Workspace
// đều có bộ công cụ nghiệp vụ đầy đủ; phạm vi dữ liệu vẫn được giới hạn bằng
// Workspace/Project membership và maker-checker vẫn cấm tự duyệt artefact.
const ALL_BUSINESS_PERMISSIONS = Object.freeze(['*']);

const ROLE_DEFINITIONS = Object.freeze({
  [ROLE_NAMES.SYSTEM_ADMIN]: [
    'system:user:manage',
    'system:role:manage',
    'system:audit:read',
    'system:settings:manage',
  ],
  // User là tài khoản nghiệp vụ đầy đủ. Với dữ liệu có Workspace, membership
  // bên dưới vẫn là điều kiện bắt buộc để không lộ dữ liệu giữa các Workspace.
  [ROLE_NAMES.USER]: ALL_BUSINESS_PERMISSIONS,
});

// Nhãn Workspace không làm giảm khả năng thao tác. Chúng dùng để hiển thị
// trách nhiệm và làm dữ liệu audit/assignment.
const WORKSPACE_ROLE_PERMISSIONS = Object.freeze({
  [ROLE_NAMES.OWNER]: ['*'],
  [ROLE_NAMES.QA_MANAGER]: ['*'],
  [ROLE_NAMES.TESTER]: ['*'],
  [ROLE_NAMES.GUEST]: ['*'],
});

const LEGACY_ROLE_MAP = Object.freeze({
  Admin: ROLE_NAMES.SYSTEM_ADMIN,
  PM: ROLE_NAMES.USER,
  QA_Lead: ROLE_NAMES.USER,
  Developer: ROLE_NAMES.USER,
  QA_Manager: ROLE_NAMES.USER,
  Tester: ROLE_NAMES.USER,
  Guest: ROLE_NAMES.USER,
});

const normalizeRoleName = (name) => LEGACY_ROLE_MAP[name] || name;

module.exports = {
  ROLE_NAMES,
  SYSTEM_ROLE_NAMES,
  WORKSPACE_ROLE_NAMES,
  INVITABLE_WORKSPACE_ROLE_NAMES,
  PROJECT_ROLE_NAMES,
  ROLE_DEFINITIONS,
  WORKSPACE_ROLE_PERMISSIONS,
  ALL_BUSINESS_PERMISSIONS,
  LEGACY_ROLE_MAP,
  normalizeRoleName,
};
