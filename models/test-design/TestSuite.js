/**
 * ============================================================
 * MODEL: TestSuite (Bộ test / Thư mục test)
 * Phân hệ: Thiết kế Kiểm thử (Test Design)
 * Collection: test_suites
 * ============================================================
 * Quản lý cây thư mục Test dạng phân cấp (tree structure):
 * VD: "Chức năng Đăng nhập" > "Đăng nhập Email" > "TC001"
 * Hỗ trợ parentSuite để tạo cấu trúc cây lồng nhau.
 * ============================================================
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const testSuiteSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Tên Test Suite là bắt buộc'],
      trim: true,
      maxlength: [200, 'Tên Test Suite không được quá 200 ký tự'],
    },

    description: {
      type: String,
      trim: true,
      default: '',
    },

    // Thứ tự hiển thị trong cây thư mục
    order: {
      type: Number,
      default: 0,
    },

    // -------------------------------------------
    // Liên kết (References)
    // -------------------------------------------
    project: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: [true, 'Dự án là bắt buộc'],
    },

    // Self-referencing: Tạo cấu trúc cây thư mục
    parentSuite: {
      type: Schema.Types.ObjectId,
      ref: 'TestSuite',
      default: null, // null = thư mục gốc (root)
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'test_suites',
  }
);

// =============================================
// Indexes
// =============================================
testSuiteSchema.index({ project: 1, parentSuite: 1, order: 1 });
testSuiteSchema.index({ project: 1, name: 1 });

module.exports = mongoose.model('TestSuite', testSuiteSchema);
