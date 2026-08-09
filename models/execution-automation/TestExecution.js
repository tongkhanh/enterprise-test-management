/**
 * ============================================================
 * MODEL: TestExecution (Kết quả thực thi Test Case)
 * Phân hệ: Thực thi & Tích hợp Tự động (Execution & Automation)
 * Collection: test_executions
 * ============================================================
 * Kết quả thực thi thực tế của 1 Test Case trong 1 Test Run:
 * Log Pass/Fail, Evidence (ảnh chụp lỗi), kết quả từng bước.
 * ============================================================
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

// -------------------------------------------
// Sub-schema: Kết quả từng bước test
// -------------------------------------------
const stepResultSchema = new Schema(
  {
    stepNumber: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ['Passed', 'Failed', 'Blocked', 'Skipped'],
      required: true,
    },
    actualResult: {
      type: String,
      default: '',
    },
    note: {
      type: String,
      default: '',
    },
  },
  { _id: false }
);

const testExecutionSchema = new Schema(
  {
    result: {
      type: String,
      enum: {
        values: ['Passed', 'Failed', 'Blocked', 'Skipped', 'NotRun'],
        message: 'Kết quả phải là: Passed, Failed, Blocked, Skipped, hoặc NotRun',
      },
      default: 'NotRun',
    },

    executedAt: {
      type: Date,
      default: null,
    },

    // Thời gian thực hiện (phút)
    duration: {
      type: Number,
      default: 0,
      min: 0,
    },

    notes: {
      type: String,
      default: '',
    },

    // Kết quả thực tế (mô tả)
    actualResult: {
      type: String,
      default: '',
    },

    // Ảnh chụp evidence (danh sách URL)
    evidence: [
      {
        type: String,
        // URL ảnh chụp màn hình lỗi
      },
    ],

    // -------------------------------------------
    // Embedded: Kết quả từng bước
    // -------------------------------------------
    stepResults: [stepResultSchema],

    // -------------------------------------------
    // Liên kết (References)
    // -------------------------------------------
    testRun: {
      type: Schema.Types.ObjectId,
      ref: 'TestRun',
      required: [true, 'Test Run là bắt buộc'],
    },

    testCase: {
      type: Schema.Types.ObjectId,
      ref: 'TestCase',
      required: [true, 'Test Case là bắt buộc'],
    },

    executedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    // Bug được báo từ test execution này
    bugReported: {
      type: Schema.Types.ObjectId,
      ref: 'Bug',
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'test_executions',
  }
);

// =============================================
// Indexes
// =============================================
testExecutionSchema.index({ testRun: 1, result: 1 });
testExecutionSchema.index({ testCase: 1 });
testExecutionSchema.index({ executedBy: 1, executedAt: -1 });

module.exports = mongoose.model('TestExecution', testExecutionSchema);
