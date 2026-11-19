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

    // Test Cycle is the execution timebox. It can optionally be linked to a
    // product Sprint, but the two concepts are not treated as synonyms.
    cycleType: {
      type: String,
      enum: ['Smoke', 'Functional', 'Regression', 'ReleaseValidation', 'Exploratory', 'Custom'],
      default: 'Custom',
    },
    // Optional traceability to the Agile delivery timebox. Test Cycle remains
    // independently schedulable and never becomes a Delivery Cycle itself.
    deliveryCycle: { type: Schema.Types.ObjectId, ref: 'DeliveryCycle', default: null },
    linkedProductSprint: { type: Schema.Types.ObjectId, ref: 'Sprint', default: null },
    buildLabel: { type: String, trim: true, default: '', maxlength: 200 },
    releaseLabel: { type: String, trim: true, default: '', maxlength: 200 },

    sequence: { type: Number, min: 1, default: 1 },

    capacity: { type: Number, min: 0, default: 0 },
    planningCapacityMinutes: { type: Number, min: 0, default: 0 },
    planningMaxCases: { type: Number, min: 0, default: 0 },
    sourceTestPlans: [{ type: Schema.Types.ObjectId, ref: 'TestPlan' }],
    planningUpdatedAt: { type: Date, default: null },
    planningUpdatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    planningOrigin: { type: String, enum: ['Manual', 'AI', 'PriorityRules'], default: 'Manual' },
    planningAssumptions: { type: [String], default: [] },

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
