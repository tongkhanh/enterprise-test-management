/**
 * ============================================================
 * MODEL: Bug (Lỗi phần mềm)
 * Phân hệ: Quản lý Lỗi (Bug Tracking)
 * Collection: bugs
 * ============================================================
 * Thông tin chi tiết của lỗi: Mô tả, Mức độ nghiêm trọng
 * (Severity), Độ ưu tiên (Priority), Môi trường xảy ra,
 * Các bước tái tạo, và trạng thái vòng đời Bug.
 * ============================================================
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const bugSchema = new Schema(
  {
    title: {
      type: String,
      required: [true, 'Tiêu đề Bug là bắt buộc'],
      trim: true,
      maxlength: [500, 'Tiêu đề không được quá 500 ký tự'],
    },

    description: {
      type: String,
      required: [true, 'Mô tả Bug là bắt buộc'],
    },

    // Các bước tái tạo lỗi
    stepsToReproduce: {
      type: String,
      default: '',
      // VD: "1. Mở trang Login\n2. Nhập email sai\n3. Click Đăng nhập\n4. Bug xảy ra"
    },

    // -------------------------------------------
    // Phân loại mức độ
    // -------------------------------------------
    severity: {
      type: String,
      enum: {
        values: ['Critical', 'Major', 'Minor', 'Trivial'],
        message: 'Mức độ nghiêm trọng phải là: Critical, Major, Minor, hoặc Trivial',
      },
      required: [true, 'Mức độ nghiêm trọng là bắt buộc'],
    },

    priority: {
      type: String,
      enum: {
        values: ['Urgent', 'High', 'Medium', 'Low'],
        message: 'Độ ưu tiên phải là: Urgent, High, Medium, hoặc Low',
      },
      required: [true, 'Độ ưu tiên là bắt buộc'],
    },

    // -------------------------------------------
    // Trạng thái vòng đời Bug
    // -------------------------------------------
    status: {
      type: String,
      enum: {
        values: ['New', 'Open', 'InProgress', 'Resolved', 'Verified', 'Closed', 'Reopened'],
        message: 'Trạng thái Bug không hợp lệ',
      },
      default: 'New',
    },

    // -------------------------------------------
    // Thông tin môi trường
    // -------------------------------------------
    environment: {
      type: String,
      default: '',
      // VD: "Staging", "Production", "Development"
    },

    browser: {
      type: String,
      default: '',
    },

    os: {
      type: String,
      default: '',
    },

    // -------------------------------------------
    // Đính kèm & Tags
    // -------------------------------------------
    attachments: [
      {
        fileName: { type: String },
        fileUrl: { type: String },
        fileType: { type: String },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],

    tags: {
      type: [String],
      default: [],
    },

    // -------------------------------------------
    // Liên kết (References)
    // -------------------------------------------
    project: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: [true, 'Dự án là bắt buộc'],
    },

    reportedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Người báo lỗi là bắt buộc'],
    },

    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null, // Developer được gán xử lý
    },

    testExecution: {
      type: Schema.Types.ObjectId,
      ref: 'TestExecution',
      default: null, // Bug phát hiện từ Test Execution nào
    },

    userStory: {
      type: Schema.Types.ObjectId,
      ref: 'UserStory',
      default: null,
    },

    sprint: {
      type: Schema.Types.ObjectId,
      ref: 'Sprint',
      default: null,
    },

    release: {
      type: Schema.Types.ObjectId,
      ref: 'Release',
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'bugs',
  }
);

// =============================================
// Indexes
// =============================================
bugSchema.index({ project: 1, status: 1, severity: 1 });
bugSchema.index({ assignedTo: 1, status: 1 });
bugSchema.index({ reportedBy: 1, createdAt: -1 });
bugSchema.index({ sprint: 1, status: 1 });
bugSchema.index({ release: 1, severity: 1 });
bugSchema.index({ tags: 1 });

module.exports = mongoose.model('Bug', bugSchema);
