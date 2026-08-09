/**
 * ============================================================
 * MODEL: AiChatSession (Phiên chat với Trợ lý ảo AI)
 * Phân hệ: Lõi Trí Tuệ Nhân Tạo (AI Core) 🌟
 * Collection: ai_chat_sessions
 * ============================================================
 * Quản lý các phiên trò chuyện giữa Tester và Trợ lý ảo AI
 * (Chatbot RAG). Lưu trữ toàn bộ lịch sử tin nhắn.
 * ============================================================
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

// -------------------------------------------
// Sub-schema: Tin nhắn trong phiên chat
// -------------------------------------------
const chatMessageSchema = new Schema(
  {
    role: {
      type: String,
      enum: {
        values: ['user', 'assistant', 'system'],
        message: 'Role phải là: user, assistant, hoặc system',
      },
      required: true,
    },

    content: {
      type: String,
      required: [true, 'Nội dung tin nhắn là bắt buộc'],
    },

    timestamp: {
      type: Date,
      default: Date.now,
    },

    // Token sử dụng cho tin nhắn này
    tokensUsed: {
      type: Number,
      default: 0,
    },
  },
  { _id: true } // Giữ _id để có thể reference tới từng tin nhắn
);

const aiChatSessionSchema = new Schema(
  {
    title: {
      type: String,
      default: 'Phiên chat mới',
      trim: true,
    },

    status: {
      type: String,
      enum: {
        values: ['Active', 'Closed'],
        message: 'Trạng thái phải là: Active hoặc Closed',
      },
      default: 'Active',
    },

    // -------------------------------------------
    // Embedded: Lịch sử tin nhắn
    // -------------------------------------------
    messages: [chatMessageSchema],

    // Tổng token đã tiêu thụ trong phiên
    totalTokensUsed: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Context bổ sung (VD: thông tin project, sprint hiện tại)
    context: {
      type: Schema.Types.Mixed,
      default: null,
    },

    // -------------------------------------------
    // Liên kết (References)
    // -------------------------------------------
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Người dùng là bắt buộc'],
    },

    project: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'ai_chat_sessions',
  }
);

// =============================================
// Indexes
// =============================================
aiChatSessionSchema.index({ user: 1, status: 1, updatedAt: -1 });
aiChatSessionSchema.index({ project: 1, updatedAt: -1 });

module.exports = mongoose.model('AiChatSession', aiChatSessionSchema);
