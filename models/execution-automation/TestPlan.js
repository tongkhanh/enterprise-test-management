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

    status: {
      type: String,
      enum: {
        values: ['Draft', 'Active', 'Completed', 'Archived'],
        message: 'Trạng thái phải là: Draft, Active, Completed, hoặc Archived',
      },
      default: 'Draft',
    },

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

module.exports = mongoose.model('TestPlan', testPlanSchema);
