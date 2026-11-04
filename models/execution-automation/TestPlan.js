/**
 * ============================================================
 * MODEL: TestPlan (Kế hoạch kiểm thử)
 * Phân hệ: Thực thi & Tích hợp Tự động (Execution & Automation)
 * Collection: test_plans
 * ============================================================
 * Kế hoạch kiểm thử: Phạm vi test, Người phụ trách,
 * Thuộc Release nào, danh sách Test Cases cần chạy.
 * ============================================================
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const testPlanSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Tên Test Plan là bắt buộc'],
      trim: true,
      maxlength: [300, 'Tên Test Plan không được quá 300 ký tự'],
    },

    description: {
      type: String,
      trim: true,
      default: '',
    },

    // Phạm vi kiểm thử
    scope: {
      type: String,
      default: '',
      // VD: "Test toàn bộ chức năng Đăng nhập, Đăng ký, và Quên mật khẩu"
    },
    planId: { type: String, trim: true, default: '' },
    // Phân biệt kế hoạch kiểm thử trước khi thiết kế case và kế hoạch thực thi sau khi case đã được duyệt.
    kind: {
      type: String,
      enum: ['TestPlan', 'ExecutionPlan'],
      default: 'TestPlan',
      index: true,
    },
    // Master = toàn Project/Release; Feature = một module/epic hoặc nhóm User
    // Story liên quan; CycleExecution = tập Test Case thực thi trong một Cycle.
    // Giữ trường này độc lập với `kind` để phân biệt tài liệu chiến lược và kế
    // hoạch chạy, thay vì gọi chung tất cả là Test Plan.
    planLevel: {
      type: String,
      enum: ['Master', 'Feature', 'CycleExecution'],
      default: 'Feature',
      index: true,
    },
    // Ghi tại thời điểm tạo để truy vết nguồn tài liệu, không suy đoán ở UI.
    origin: {
      type: String,
      enum: ['Manual', 'AI', 'Rule', 'Board'],
      default: null,
      index: true,
    },
    systemProfile: { type: Schema.Types.ObjectId, ref: 'SystemProfile', default: null, index: true },
    userStories: [{ type: Schema.Types.ObjectId, ref: 'UserStory' }],
    objectives: { type: [String], default: [] },
    testStrategy: { type: String, default: '' },
    testData: { type: String, default: '' },
    testItems: { type: [String], default: [] },
    outOfScope: { type: [String], default: [] },
    entryCriteria: { type: [String], default: [] },
    exitCriteria: { type: [String], default: [] },
    risks: { type: [{ risk: String, mitigation: String, owner: String }], default: [] },
    deliverables: { type: [String], default: [] },

    status: {
      type: String,
      enum: {
        values: ['Draft', 'Active', 'Completed', 'Archived'],
        message: 'Trạng thái phải là: Draft, Active, Completed, hoặc Archived',
      },
      default: 'Draft',
    },
    approvalStatus: {
      type: String,
      enum: ['Draft', 'PendingApproval', 'Approved', 'Rejected'],
      default: 'Draft',
      index: true,
    },
    aiSuggestion: { type: Schema.Types.Mixed, default: null },
    reviewNote: { type: String, default: '' },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },

    startDate: {
      type: Date,
      default: null,
    },

    endDate: {
      type: Date,
      default: null,
    },

    // Môi trường test
    environment: {
      type: String,
      default: '',
      // VD: "Staging - Ubuntu 22.04 - Chrome 120"
    },

    // -------------------------------------------
    // Liên kết (References)
    // -------------------------------------------
    project: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: [true, 'Dự án là bắt buộc'],
    },

    cycle: {
      type: Schema.Types.ObjectId,
      ref: 'Sprint',
      default: null,
    },

    boardItems: [{ type: Schema.Types.ObjectId, ref: 'BoardItem' }],

    release: {
      type: Schema.Types.ObjectId,
      ref: 'Release',
      default: null,
    },

    assignee: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null, // Người phụ trách chính
    },

    testCases: [
      {
        type: Schema.Types.ObjectId,
        ref: 'TestCase',
      },
    ],

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'test_plans',
  }
);

// =============================================
// Indexes
// =============================================
testPlanSchema.index({ project: 1, status: 1 });
testPlanSchema.index({ release: 1 });
testPlanSchema.index({ assignee: 1 });
testPlanSchema.index({ cycle: 1, status: 1 });

module.exports = mongoose.model('TestPlan', testPlanSchema);
