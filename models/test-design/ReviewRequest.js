/**
 * ============================================================
 * MODEL: ReviewRequest (Yêu cầu phê duyệt Test Case)
 * Phân hệ: Thiết kế Kiểm thử (Test Design)
 * Collection: review_requests
 * ============================================================
 * Quy trình Maker - Checker:
 * Tester A gửi yêu cầu duyệt Test Case cho QA Lead.
 * Trạng thái: Pending → Approved / Rejected.
 * ============================================================
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const reviewRequestSchema = new Schema(
  {
    status: {
      type: String,
      enum: {
        values: ['Pending', 'Approved', 'Rejected', 'Cancelled'],
        message: 'Trạng thái phải là: Pending, Approved, Rejected, hoặc Cancelled',
      },
      default: 'Pending',
    },

    // Ghi chú từ người duyệt
    reviewNote: {
      type: String,
      trim: true,
      default: '',
      // VD: "Test Case cần bổ sung thêm bước verify email"
    },

    submittedAt: {
      type: Date,
      default: Date.now,
    },

    reviewedAt: {
      type: Date,
      default: null, // Thời điểm QA Lead duyệt/từ chối
    },

    // -------------------------------------------
    // Liên kết (References)
    // -------------------------------------------
    testCase: {
      type: Schema.Types.ObjectId,
      ref: 'TestCase',
      required: [true, 'Test Case là bắt buộc'],
    },

    // Tester gửi yêu cầu
    requestedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Người yêu cầu là bắt buộc'],
    },

    // QA Lead duyệt
    reviewer: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Người duyệt là bắt buộc'],
    },
  },
  {
    timestamps: true,
    collection: 'review_requests',
  }
);

// =============================================
// Indexes
// =============================================
reviewRequestSchema.index({ reviewer: 1, status: 1 });
reviewRequestSchema.index({ requestedBy: 1, status: 1 });
reviewRequestSchema.index({ testCase: 1 });

module.exports = mongoose.model('ReviewRequest', reviewRequestSchema);
