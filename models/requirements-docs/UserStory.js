/**
 * ============================================================
 * MODEL: UserStory (Yêu cầu nghiệp vụ)
 * Phân hệ: Quản lý Yêu cầu & Tài liệu (Requirements & Docs)
 * Collection: user_stories
 * ============================================================
 * Quản lý User Story: Tiêu đề, Mô tả, Acceptance Criteria,
 * Story Points, thuộc Sprint nào, gán cho ai.
 * ============================================================
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const userStorySchema = new Schema(
  {
    title: {
      type: String,
      required: [true, 'Tiêu đề User Story là bắt buộc'],
      trim: true,
      maxlength: [300, 'Tiêu đề không được quá 300 ký tự'],
    },

    description: {
      type: String,
      default: '',
      // Format: "As a [role], I want [feature], so that [benefit]"
    },

    // Tiêu chí chấp nhận
    acceptanceCriteria: [
      {
        criteria: { type: String, required: true },
        isCompleted: { type: Boolean, default: false },
      },
    ],

    storyPoints: {
      type: Number,
      default: 0,
      min: [0, 'Story Points không được âm'],
      // Thường dùng dãy Fibonacci: 1, 2, 3, 5, 8, 13, 21
    },

    priority: {
      type: String,
      enum: {
        values: ['Critical', 'High', 'Medium', 'Low'],
        message: 'Độ ưu tiên phải là: Critical, High, Medium, hoặc Low',
      },
      default: 'Medium',
    },

    status: {
      type: String,
      enum: {
        values: ['Backlog', 'Ready', 'InProgress', 'Review', 'Done', 'Cancelled'],
        message: 'Trạng thái không hợp lệ',
      },
      default: 'Backlog',
    },

    labels: {
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

    sprint: {
      type: Schema.Types.ObjectId,
      ref: 'Sprint',
      default: null, // null = chưa đưa vào Sprint nào
    },

    assignee: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'user_stories',
  }
);

// =============================================
// Indexes
// =============================================
userStorySchema.index({ project: 1, status: 1 });
userStorySchema.index({ sprint: 1 });
userStorySchema.index({ assignee: 1, status: 1 });
userStorySchema.index({ project: 1, priority: 1 });

module.exports = mongoose.model('UserStory', userStorySchema);
