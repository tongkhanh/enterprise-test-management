/**
 * ============================================================
 * MODEL: BugRetest (Kiểm tra lại lỗi)
 * Phân hệ: Quản lý Lỗi (Bug Tracking)
 * Collection: bug_retests
 * ============================================================
 * Ghi nhận các đợt kiểm tra lại lỗi sau khi Dev fix:
 * Tester nào retest, kết quả Pass hay lại Fail tiếp.
 * ============================================================
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const bugRetestSchema = new Schema(
  {
    result: {
      type: String,
      enum: {
        values: ['Passed', 'Failed'],
        message: 'Kết quả Retest phải là: Passed hoặc Failed',
      },
      required: [true, 'Kết quả Retest là bắt buộc'],
    },

    retestDate: {
      type: Date,
      default: Date.now,
    },

    notes: {
      type: String,
      trim: true,
      default: '',
      // VD: "Bug vẫn xảy ra trên trình duyệt Safari"
    },

    // Evidence (ảnh chụp màn hình)
    evidence: [
      {
        type: String,
        // URL ảnh chụp
      },
    ],

    // Lần retest thứ mấy
    retestRound: {
      type: Number,
      default: 1,
      min: [1, 'Vòng retest phải >= 1'],
    },

    // -------------------------------------------
    // Liên kết (References)
    // -------------------------------------------
    bug: {
      type: Schema.Types.ObjectId,
      ref: 'Bug',
      required: [true, 'Bug là bắt buộc'],
    },

    retester: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Tester retest là bắt buộc'],
    },
  },
  {
    timestamps: true,
    collection: 'bug_retests',
  }
);

// =============================================
// Indexes
// =============================================
bugRetestSchema.index({ bug: 1, retestRound: 1 });
bugRetestSchema.index({ retester: 1, retestDate: -1 });

module.exports = mongoose.model('BugRetest', bugRetestSchema);
