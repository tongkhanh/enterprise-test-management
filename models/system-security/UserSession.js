/**
 * ============================================================
 * MODEL: UserSession (Phiên đăng nhập)
 * Phân hệ: Quản trị & Bảo mật Hệ thống (System & Security)
 * Collection: user_sessions
 * ============================================================
 * Lưu thông tin phiên đăng nhập: Token, IP, thiết bị, thời gian.
 * Hỗ trợ tính năng "Kick user khỏi thiết bị lạ".
 * ============================================================
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const userSessionSchema = new Schema(
  {
    // -------------------------------------------
    // Liên kết (References)
    // -------------------------------------------
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User là bắt buộc'],
    },

    // -------------------------------------------
    // Thông tin phiên
    // -------------------------------------------
    token: {
      type: String,
      required: [true, 'Token là bắt buộc'],
    },

    refreshToken: {
      type: String,
      default: null,
    },

    ipAddress: {
      type: String,
      required: true,
    },

    deviceName: {
      type: String,
      default: 'Unknown Device',
    },

    browser: {
      type: String,
      default: 'Unknown', // Chrome, Safari, Firefox, Edge, v.v.
    },

    os: {
      type: String,
      default: 'Unknown', // Windows, macOS, iOS, Android, v.v.
    },

    userAgent: {
      type: String,
      default: '',
    },

    // -------------------------------------------
    // Trạng thái & Thời gian
    // -------------------------------------------
    isActive: {
      type: Boolean,
      default: true,
    },

    loginAt: {
      type: Date,
      default: Date.now,
    },

    logoutAt: {
      type: Date,
      default: null,
    },

    lastActivityAt: {
      type: Date,
      default: Date.now,
    },

    // Token hết hạn lúc nào
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'user_sessions',
  }
);

// =============================================
// Indexes
// =============================================
userSessionSchema.index({ user: 1, isActive: 1 });
userSessionSchema.index({ token: 1 });
userSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL Index - tự xóa khi hết hạn

module.exports = mongoose.model('UserSession', userSessionSchema);
