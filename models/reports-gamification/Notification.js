/**
 * ============================================================
 * MODEL: Notification (Thông báo hệ thống)
 * Phân hệ: Báo cáo, Đánh giá & Tiện ích (Reports & Gamification)
 * Collection: notifications
 * ============================================================
 * Hệ thống chuông báo (In-app Notifications):
 * Thông báo có Bug mới, được gán task, tag tên, v.v.
 * ============================================================
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const notificationSchema = new Schema(
  {
    type: {
      type: String,
      enum: {
        values: [
          'BugAssigned',
          'BugStatusChanged',
          'TestRunCompleted',
          'MentionedInComment',
          'ReviewRequested',
          'ReviewCompleted',
          'SprintStarted',
          'SprintEnded',
          'ReleasePublished',
          'System',
        ],
        message: 'Loại thông báo không hợp lệ',
      },
      required: [true, 'Loại thông báo là bắt buộc'],
    },

    title: {
      type: String,
      required: [true, 'Tiêu đề thông báo là bắt buộc'],
      trim: true,
    },

    message: {
      type: String,
      required: [true, 'Nội dung thông báo là bắt buộc'],
    },

    isRead: {
      type: Boolean,
      default: false,
    },

    readAt: {
      type: Date,
      default: null,
    },

    // Link dẫn tới trang liên quan
    link: {
      type: String,
      default: null,
      // VD: "/projects/abc/bugs/bug-123"
    },

    // -------------------------------------------
    // Polymorphic: Entity liên quan
    // -------------------------------------------
    relatedEntity: {
      entityType: {
        type: String,
        default: null,
        // VD: 'Bug', 'TestRun', 'ReviewRequest', 'Sprint'
      },
      entityId: {
        type: Schema.Types.ObjectId,
        default: null,
      },
    },

    // -------------------------------------------
    // Liên kết (References)
    // -------------------------------------------
    recipient: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Người nhận là bắt buộc'],
    },

    sender: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null, // null = hệ thống tự gửi
    },
  },
  {
    timestamps: true,
    collection: 'notifications',
  }
);

// =============================================
// Indexes
// =============================================
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, type: 1 });
notificationSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
