/**
 * ============================================================
 * MODEL: DesignMockup (Thiết kế giao diện)
 * Phân hệ: Quản lý Yêu cầu & Tài liệu (Requirements & Docs)
 * Collection: design_mockups
 * ============================================================
 * Lưu trữ link thiết kế Figma hoặc file ảnh giao diện.
 * Tester dùng làm căn cứ kiểm thử UI.
 * ============================================================
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const designMockupSchema = new Schema(
  {
    title: {
      type: String,
      required: [true, 'Tiêu đề thiết kế là bắt buộc'],
      trim: true,
    },

    description: {
      type: String,
      trim: true,
      default: '',
    },

    type: {
      type: String,
      enum: {
        values: ['Figma', 'Image', 'PDF', 'Sketch', 'AdobeXD', 'Other'],
        message: 'Loại file phải là: Figma, Image, PDF, Sketch, AdobeXD, hoặc Other',
      },
      required: [true, 'Loại thiết kế là bắt buộc'],
    },

    // URL file ảnh/PDF được upload
    fileUrl: {
      type: String,
      default: null,
    },

    // Link Figma (nếu type = Figma)
    figmaUrl: {
      type: String,
      default: null,
    },

    // Phiên bản thiết kế
    version: {
      type: String,
      default: 'v1.0',
    },

    status: {
      type: String,
      enum: {
        values: ['Draft', 'Review', 'Approved', 'Outdated'],
        message: 'Trạng thái phải là: Draft, Review, Approved, hoặc Outdated',
      },
      default: 'Draft',
    },

    // -------------------------------------------
    // Liên kết (References)
    // -------------------------------------------
    userStory: {
      type: Schema.Types.ObjectId,
      ref: 'UserStory',
      default: null,
    },

    project: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: [true, 'Dự án là bắt buộc'],
    },

    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Người upload là bắt buộc'],
    },
  },
  {
    timestamps: true,
    collection: 'design_mockups',
  }
);

// =============================================
// Indexes
// =============================================
designMockupSchema.index({ project: 1, status: 1 });
designMockupSchema.index({ userStory: 1 });

module.exports = mongoose.model('DesignMockup', designMockupSchema);
