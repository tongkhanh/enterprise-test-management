/**
 * ============================================================
 * MODEL: SharedTestData (Dữ liệu test dùng chung)
 * Phân hệ: Thiết kế Kiểm thử (Test Design)
 * Collection: shared_test_data
 * ============================================================
 * Kho lưu trữ tài khoản test, thẻ tín dụng test, data giả
 * để nhiều Test Case có thể gọi chung ra dùng.
 * ============================================================
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const sharedTestDataSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Tên dữ liệu test là bắt buộc'],
      trim: true,
    },

    description: {
      type: String,
      trim: true,
      default: '',
    },

    category: {
      type: String,
      enum: {
        values: ['Account', 'CreditCard', 'Address', 'APIKey', 'Custom'],
        message: 'Danh mục phải là: Account, CreditCard, Address, APIKey, hoặc Custom',
      },
      default: 'Custom',
    },

    // Dữ liệu linh hoạt (Mixed type cho phép lưu JSON bất kỳ)
    // VD cho Account:  { email: "test@mail.com", password: "Test@123" }
    // VD cho CreditCard: { number: "4111111111111111", cvv: "123", exp: "12/26" }
    data: {
      type: Schema.Types.Mixed,
      required: [true, 'Dữ liệu test là bắt buộc'],
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    // -------------------------------------------
    // Liên kết (References)
    // -------------------------------------------
    project: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: [true, 'Dự án là bắt buộc'],
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'shared_test_data',
  }
);

// =============================================
// Indexes
// =============================================
sharedTestDataSchema.index({ project: 1, category: 1 });
sharedTestDataSchema.index({ project: 1, isActive: 1 });

module.exports = mongoose.model('SharedTestData', sharedTestDataSchema);
