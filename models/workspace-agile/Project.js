/**
 * ============================================================
 * MODEL: Project (Dự án)
 * Phân hệ: Quản lý Đa dự án & Agile (Workspace & Agile)
 * Collection: projects
 * ============================================================
 * Thông tin dự án: Tên, Key (mã viết tắt), Trạng thái.
 * Thuộc 1 Workspace, có nhiều thành viên.
 * ============================================================
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const projectSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Tên dự án là bắt buộc'],
      trim: true,
      maxlength: [200, 'Tên dự án không được quá 200 ký tự'],
    },

    // Mã viết tắt dự án (VD: "PRJ", "ERP", "CRM")
    key: {
      type: String,
      required: [true, 'Mã dự án (Key) là bắt buộc'],
      uppercase: true,
      trim: true,
      maxlength: [10, 'Mã dự án không được quá 10 ký tự'],
      match: [/^[A-Z0-9]+$/, 'Mã dự án chỉ chấp nhận chữ in hoa và số'],
    },

    description: {
      type: String,
      trim: true,
      default: '',
    },

    status: {
      type: String,
      enum: {
        values: ['Active', 'Archived', 'Completed'],
        message: 'Trạng thái phải là: Active, Archived, hoặc Completed',
      },
      default: 'Active',
    },

    startDate: {
      type: Date,
      default: null,
    },

    endDate: {
      type: Date,
      default: null,
    },

    tags: {
      type: [String],
      default: [],
    },
    issueSequence: { type: Number, default: 0, min: 0 },

    // -------------------------------------------
    // Liên kết (References)
    // -------------------------------------------
    workspace: {
      type: Schema.Types.ObjectId,
      ref: 'Workspace',
      required: [true, 'Workspace là bắt buộc'],
    },

    lead: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null, // Trưởng dự án
    },

    teams: [{ type: Schema.Types.ObjectId, ref: 'Team' }],
    priority: { type: String, enum: ['No priority', 'Urgent', 'High', 'Medium', 'Low'], default: 'No priority' },
    health: { type: String, enum: ['On track', 'At risk', 'Off track', 'No update'], default: 'No update' },
    icon: { type: String, default: 'folder-kanban' },

    members: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
  },
  {
    timestamps: true,
    collection: 'projects',
  }
);

// =============================================
// Indexes
// =============================================
projectSchema.index({ workspace: 1, key: 1 }, { unique: true }); // Key duy nhất trong Workspace
projectSchema.index({ workspace: 1, status: 1 });
projectSchema.index({ members: 1 });

module.exports = mongoose.model('Project', projectSchema);
