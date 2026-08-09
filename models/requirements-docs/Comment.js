/**
 * ============================================================
 * MODEL: Comment (Bình luận)
 * Phân hệ: Quản lý Yêu cầu & Tài liệu (Requirements & Docs)
 * Collection: comments
 * ============================================================
 * Tính năng bình luận đa hình (Polymorphic):
 * Có thể comment trên UserStory, Bug, hoặc TestCase.
 * Hỗ trợ tag tên (@mention), reply (nested comments),
 * và đính kèm file.
 * ============================================================
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const commentSchema = new Schema(
  {
    content: {
      type: String,
      required: [true, 'Nội dung bình luận là bắt buộc'],
      maxlength: [5000, 'Nội dung không được quá 5000 ký tự'],
    },

    // -------------------------------------------
    // Polymorphic Reference (Comment thuộc entity nào)
    // -------------------------------------------
    entityType: {
      type: String,
      required: [true, 'Loại entity là bắt buộc'],
      enum: {
        values: ['UserStory', 'Bug', 'TestCase'],
        message: 'Entity phải là: UserStory, Bug, hoặc TestCase',
      },
    },

    entityId: {
      type: Schema.Types.ObjectId,
      required: [true, 'ID entity là bắt buộc'],
      refPath: 'entityType', // Dynamic reference dựa trên entityType
    },

    // -------------------------------------------
    // Mentions (@tag tên)
    // -------------------------------------------
    mentions: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],

    // -------------------------------------------
    // Đính kèm file
    // -------------------------------------------
    attachments: [
      {
        fileName: { type: String },
        fileUrl: { type: String },
        fileType: { type: String },
        fileSize: { type: Number }, // bytes
      },
    ],

    // -------------------------------------------
    // Reply (Nested comments)
    // -------------------------------------------
    parentComment: {
      type: Schema.Types.ObjectId,
      ref: 'Comment',
      default: null, // null = comment gốc, có giá trị = reply
    },

    isEdited: {
      type: Boolean,
      default: false,
    },

    // -------------------------------------------
    // Liên kết (References)
    // -------------------------------------------
    author: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Tác giả là bắt buộc'],
    },
  },
  {
    timestamps: true,
    collection: 'comments',
  }
);

// =============================================
// Indexes
// =============================================
commentSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
commentSchema.index({ author: 1 });
commentSchema.index({ parentComment: 1 });
commentSchema.index({ mentions: 1 });

module.exports = mongoose.model('Comment', commentSchema);
