/**
 * ============================================================
 * MODEL: TestCase (Kịch bản kiểm thử)
 * Phân hệ: Thiết kế Kiểm thử (Test Design)
 * Collection: test_cases
 * ============================================================
 * Lưu trữ toàn bộ dữ liệu 1 kịch bản kiểm thử:
 * Tiêu đề, Mô tả, Điều kiện tiên quyết, Loại test,
 * và mảng Test Steps (embedded subdocument) nằm ngay trong đây.
 * ============================================================
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

// -------------------------------------------
// Sub-schema: Test Step (Bước kiểm thử)
// -------------------------------------------
const testStepSchema = new Schema(
  {
    stepNumber: {
      type: Number,
      required: [true, 'Số thứ tự bước là bắt buộc'],
    },
    action: {
      type: String,
      required: [true, 'Hành động là bắt buộc'],
      // VD: "Nhập email 'test@gmail.com' vào ô Email"
    },
    expectedResult: {
      type: String,
      required: [true, 'Kết quả mong đợi là bắt buộc'],
      // VD: "Hệ thống hiển thị trang Dashboard"
    },
    testData: {
      type: String,
      default: '',
      // VD: "Email: test@gmail.com, Password: 123456"
    },
  },
  { _id: false } // Không tạo _id riêng cho mỗi step
);

const testCaseSchema = new Schema(
  {
    title: {
      type: String,
      required: [true, 'Tiêu đề Test Case là bắt buộc'],
      trim: true,
      maxlength: [500, 'Tiêu đề không được quá 500 ký tự'],
    },

    description: {
      type: String,
      trim: true,
      default: '',
    },

    // Điều kiện tiên quyết trước khi thực hiện test
    preconditions: {
      type: String,
      default: '',
      // VD: "User đã đăng nhập, đang ở trang Dashboard"
    },

    priority: {
      type: String,
      enum: {
        values: ['Critical', 'High', 'Medium', 'Low'],
        message: 'Độ ưu tiên phải là: Critical, High, Medium, hoặc Low',
      },
      default: 'Medium',
    },

    type: {
      type: String,
      enum: {
        values: ['Manual', 'Automated'],
        message: 'Loại test phải là: Manual hoặc Automated',
      },
      default: 'Manual',
    },

    status: {
      type: String,
      enum: {
        values: ['Draft', 'Active', 'Deprecated', 'NeedsReview'],
        message: 'Trạng thái phải là: Draft, Active, Deprecated, hoặc NeedsReview',
      },
      default: 'Draft',
    },

    // Thời gian ước tính (phút)
    estimatedTime: {
      type: Number,
      default: 0,
      min: [0, 'Thời gian không được âm'],
    },

    // -------------------------------------------
    // Embedded: Test Steps (Các bước kiểm thử)
    // -------------------------------------------
    testSteps: [testStepSchema],

    // Tags để phân loại
    tags: {
      type: [String],
      default: [],
    },

    // -------------------------------------------
    // Liên kết (References)
    // -------------------------------------------
    testSuite: {
      type: Schema.Types.ObjectId,
      ref: 'TestSuite',
      required: [true, 'Test Suite là bắt buộc'],
    },

    userStory: {
      type: Schema.Types.ObjectId,
      ref: 'UserStory',
      default: null, // Liên kết tới yêu cầu nghiệp vụ (traceability)
    },

    // Dữ liệu test dùng chung
    sharedTestData: [
      {
        type: Schema.Types.ObjectId,
        ref: 'SharedTestData',
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
    collection: 'test_cases',
  }
);

// =============================================
// Indexes
// =============================================
testCaseSchema.index({ testSuite: 1, status: 1 });
testCaseSchema.index({ userStory: 1 });
testCaseSchema.index({ priority: 1, type: 1 });
testCaseSchema.index({ tags: 1 });
testCaseSchema.index({ createdBy: 1 });

module.exports = mongoose.model('TestCase', testCaseSchema);
