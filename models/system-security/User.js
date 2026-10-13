/**
 * ============================================================
 * MODEL: User (Người dùng)
 * Phân hệ: Quản trị & Bảo mật Hệ thống (System & Security)
 * Collection: users
 * ============================================================
 * Lưu trữ thông tin cá nhân của người dùng hệ thống:
 * Email, Mật khẩu đã băm, Avatar, Trạng thái hoạt động.
 * ============================================================
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const userSchema = new Schema(
  {
    // -------------------------------------------
    // Thông tin cá nhân
    // -------------------------------------------
    fullName: {
      type: String,
      required: [true, 'Họ và tên là bắt buộc'],
      trim: true,
      maxlength: [100, 'Họ tên không được quá 100 ký tự'],
    },

    email: {
      type: String,
      required: [true, 'Email là bắt buộc'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Email không hợp lệ'],
    },

    passwordHash: {
      type: String,
      required: [true, 'Mật khẩu là bắt buộc'],
      select: false, // Không trả về khi query mặc định
    },

    avatar: {
      type: String,
      default: null, // URL ảnh đại diện
    },

    phone: {
      type: String,
      trim: true,
      default: null,
    },

    // -------------------------------------------
    // Trạng thái tài khoản
    // -------------------------------------------
    status: {
      type: String,
      enum: {
        values: ['active', 'inactive', 'suspended'],
        message: 'Trạng thái phải là: active, inactive, hoặc suspended',
      },
      default: 'active',
    },

    isEmailVerified: {
      type: Boolean,
      default: false,
    },

    lastLoginAt: {
      type: Date,
      default: null,
    },

    // -------------------------------------------
    // Liên kết (References)
    // -------------------------------------------
    role: {
      type: Schema.Types.ObjectId,
      ref: 'Role',
      required: [true, 'Vai trò là bắt buộc'],
    },

    workspace: {
      type: Schema.Types.ObjectId,
      ref: 'Workspace',
      default: null,
    },
  },
  {
    timestamps: true, // Tự động thêm createdAt & updatedAt
    collection: 'users',
  }
);

// =============================================
// Indexes
// =============================================
userSchema.index({ workspace: 1, status: 1 });
userSchema.index({ role: 1 });

module.exports = mongoose.model('User', userSchema);
