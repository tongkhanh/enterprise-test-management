/**
 * ============================================================
 * MODEL: BugHistory (Lịch sử trạng thái Bug)
 * Phân hệ: Quản lý Lỗi (Bug Tracking)
 * Collection: bug_histories
 * ============================================================
 * Ghi lại chi tiết thời gian mỗi lần Bug chuyển trạng thái.
 * VD: In Progress → Resolved mất bao nhiêu ngày.
 * Dùng để phân tích hiệu suất xử lý lỗi.
 * ============================================================
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const bugHistorySchema = new Schema(
  {
    // Trạng thái trước khi thay đổi
    fromStatus: {
      type: String,
      enum: ['New', 'Open', 'InProgress', 'Resolved', 'Verified', 'Closed', 'Reopened'],
      required: [true, 'Trạng thái trước là bắt buộc'],
    },

    // Trạng thái sau khi thay đổi
    toStatus: {
      type: String,
      enum: ['New', 'Open', 'InProgress', 'Resolved', 'Verified', 'Closed', 'Reopened'],
      required: [true, 'Trạng thái sau là bắt buộc'],
    },

    // Thời điểm thay đổi
    changeDate: {
      type: Date,
      default: Date.now,
    },

    // Thời gian ở trạng thái trước (phút)
    // Dùng để tính toán: "Bug ở trạng thái InProgress trong 2880 phút (2 ngày)"
    timeInPreviousStatus: {
      type: Number,
      default: 0,
      min: 0,
    },

    comment: {
      type: String,
      trim: true,
      default: '',
      // VD: "Đã fix xong, chuyển sang Resolved"
    },

    // -------------------------------------------
    // Liên kết (References)
    // -------------------------------------------
    bug: {
      type: Schema.Types.ObjectId,
      ref: 'Bug',
      required: [true, 'Bug là bắt buộc'],
    },

    changedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Người thay đổi là bắt buộc'],
    },
  },
  {
    timestamps: true,
    collection: 'bug_histories',
  }
);

// =============================================
// Indexes
// =============================================
bugHistorySchema.index({ bug: 1, changeDate: -1 });
bugHistorySchema.index({ changedBy: 1, changeDate: -1 });

module.exports = mongoose.model('BugHistory', bugHistorySchema);
