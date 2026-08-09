/**
 * ============================================================
 * MODEL: Workspace (Không gian làm việc)
 * Phân hệ: Quản lý Đa dự án & Agile (Workspace & Agile)
 * Collection: workspaces
 * ============================================================
 * Đại diện cho một công ty hoặc tổ chức.
 * Một Workspace chứa nhiều Projects.
 * ============================================================
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const workspaceSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Tên Workspace là bắt buộc'],
      trim: true,
      maxlength: [150, 'Tên Workspace không được quá 150 ký tự'],
    },

    slug: {
      type: String,
      required: [true, 'Slug là bắt buộc'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[a-z0-9-]+$/, 'Slug chỉ chấp nhận chữ thường, số và dấu gạch ngang'],
    },

    description: {
      type: String,
      trim: true,
      default: '',
    },

    logo: {
      type: String,
      default: null, // URL logo công ty
    },

    // Gói cước đang sử dụng
    plan: {
      type: String,
      enum: {
        values: ['Free', 'Pro', 'Enterprise'],
        message: 'Gói cước phải là: Free, Pro, hoặc Enterprise',
      },
      default: 'Free',
    },

    maxMembers: {
      type: Number,
      default: 5, // Giới hạn thành viên theo gói
      min: [1, 'Số thành viên tối thiểu là 1'],
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    // -------------------------------------------
    // Liên kết (References)
    // -------------------------------------------
    owner: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Chủ sở hữu Workspace là bắt buộc'],
    },
  },
  {
    timestamps: true,
    collection: 'workspaces',
  }
);

// =============================================
// Indexes
// =============================================
workspaceSchema.index({ slug: 1 }, { unique: true });
workspaceSchema.index({ owner: 1 });

module.exports = mongoose.model('Workspace', workspaceSchema);
