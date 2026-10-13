/**
 * ============================================================
 * MODEL: Role (Vai trò)
 * Phân hệ: Quản trị & Bảo mật Hệ thống (System & Security)
 * Collection: roles
 * ============================================================
 * Định nghĩa các vai trò trong hệ thống:
 * System Admin, QA Manager, Tester và Guest.
 * Mỗi vai trò có danh sách quyền (permissions) riêng.
 * ============================================================
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;
const { SYSTEM_ROLE_NAMES, WORKSPACE_ROLE_NAMES } = require('../../config/roles');

// Cho phép cả system role (System_Admin, User) lẫn workspace role
// (Owner, QA_Manager, Tester, Guest) vì collection roles lưu cả hai loại.
const ALL_ROLE_NAMES = [...new Set([...SYSTEM_ROLE_NAMES, ...WORKSPACE_ROLE_NAMES])];

const roleSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Tên vai trò là bắt buộc'],
      enum: {
        values: ALL_ROLE_NAMES,
        message: `Vai trò phải là: ${ALL_ROLE_NAMES.join(', ')}`,
      },
    },

    description: {
      type: String,
      trim: true,
      default: '',
    },

    // Danh sách quyền chi tiết
    // Ví dụ: ['project:create', 'bug:assign', 'testcase:approve', 'report:export']
    permissions: {
      type: [String],
      default: [],
    },

    isSystemRole: {
      type: Boolean,
      default: false, // true = role mặc định hệ thống, không được xóa
    },

    // -------------------------------------------
    // Liên kết (References)
    // -------------------------------------------
    workspace: {
      type: Schema.Types.ObjectId,
      ref: 'Workspace',
      default: null, // null = vai trò cấp hệ thống (global)
    },
  },
  {
    timestamps: true,
    collection: 'roles',
  }
);

// =============================================
// Indexes
// =============================================
roleSchema.index({ workspace: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Role', roleSchema);
