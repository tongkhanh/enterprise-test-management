/**
 * ============================================================
 * MODEL: Sprint (Vòng lặp Agile)
 * Phân hệ: Quản lý Đa dự án & Agile (Workspace & Agile)
 * Collection: sprints
 * ============================================================
 * Quản lý các vòng lặp Agile Sprint:
 * Tên, Ngày bắt đầu, Ngày kết thúc, Mục tiêu Sprint.
 * ============================================================
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const sprintSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Tên Sprint là bắt buộc'],
      trim: true,
      // VD: "Sprint 1", "Sprint 2 - Login Feature"
    },

    goal: {
      type: String,
      trim: true,
      default: '', // Mục tiêu của Sprint
    },

    description: { type: String, trim: true, default: '', maxlength: 1000 },

    sequence: { type: Number, min: 1, default: 1 },

    capacity: { type: Number, min: 0, default: 0 },

    color: { type: String, default: '#6D5DFB', match: /^#[0-9A-F]{6}$/i },

    startDate: {
      type: Date,
      required: [true, 'Ngày bắt đầu là bắt buộc'],
    },

    endDate: {
      type: Date,
      required: [true, 'Ngày kết thúc là bắt buộc'],
    },

    status: {
      type: String,
      enum: {
        values: ['Planning', 'Active', 'Completed', 'Cancelled'],
        message: 'Trạng thái phải là: Planning, Active, Completed, hoặc Cancelled',
      },
      default: 'Planning',
    },

    // Điểm velocity thực tế đạt được
    velocity: {
      type: Number,
      default: 0,
      min: [0, 'Velocity không được âm'],
    },

    // -------------------------------------------
    // Liên kết (References)
    // -------------------------------------------
    project: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: [true, 'Dự án là bắt buộc'],
    },

    team: {
      type: Schema.Types.ObjectId,
      ref: 'Team',
      default: null,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'sprints',
  }
);

// =============================================
// Indexes
// =============================================
sprintSchema.index({ project: 1, status: 1 });
sprintSchema.index({ project: 1, startDate: 1 });
sprintSchema.index({ project: 1, sequence: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Sprint', sprintSchema);
