/**
 * ============================================================
 * MODEL: TestRun (Đợt chạy test)
 * Phân hệ: Thực thi & Tích hợp Tự động (Execution & Automation)
 * Collection: test_runs
 * ============================================================
 * Các đợt chạy test cụ thể thuộc 1 Test Plan.
 * VD: "Test trên iOS 16", "Test trên Chrome 120".
 * Theo dõi tiến độ: tổng số case, pass, fail.
 * ============================================================
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const testRunSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Tên Test Run là bắt buộc'],
      trim: true,
    },

    description: {
      type: String,
      trim: true,
      default: '',
    },

    // Môi trường chạy test cụ thể
    environment: {
      type: String,
      default: '',
      // VD: "iOS 16 - iPhone 14 Pro", "Chrome 120 - Windows 11"
    },

    status: {
      type: String,
      enum: {
        values: ['NotStarted', 'InProgress', 'Completed', 'Aborted'],
        message: 'Trạng thái phải là: NotStarted, InProgress, Completed, hoặc Aborted',
      },
      default: 'NotStarted',
    },

    startedAt: {
      type: Date,
      default: null,
    },

    completedAt: {
      type: Date,
      default: null,
    },

    // -------------------------------------------
    // Thống kê tiến độ
    // -------------------------------------------
    totalCases: {
      type: Number,
      default: 0,
      min: 0,
    },

    passedCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    failedCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    blockedCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    skippedCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // -------------------------------------------
    // Liên kết (References)
    // -------------------------------------------
    testPlan: {
      type: Schema.Types.ObjectId,
      ref: 'TestPlan',
      required: [true, 'Test Plan là bắt buộc'],
    },

    assignee: {
      type: Schema.Types.ObjectId,
      ref: 'User',
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
    collection: 'test_runs',
  }
);

// =============================================
// Indexes
// =============================================
testRunSchema.index({ testPlan: 1, status: 1 });
testRunSchema.index({ assignee: 1, status: 1 });

module.exports = mongoose.model('TestRun', testRunSchema);
