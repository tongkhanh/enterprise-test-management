/**
 * ============================================================
 * MODEL: AiGenerationLog (Lịch sử gọi AI)
 * Phân hệ: Lõi Trí Tuệ Nhân Tạo (AI Core) 🌟
 * Collection: ai_generation_logs
 * ============================================================
 * Ghi lại lịch sử các lần gọi AI:
 * Input, Output, Số lượng Token tiêu thụ (để tính chi phí),
 * Thời gian phản hồi, Trạng thái thành công/thất bại.
 * ============================================================
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const aiGenerationLogSchema = new Schema(
  {
    // Prompt thực tế đã gửi đi (sau khi thay biến)
    promptUsed: {
      type: String,
      required: [true, 'Prompt đã sử dụng là bắt buộc'],
    },

    // Dữ liệu đầu vào (biến động truyền vào template)
    inputData: {
      type: Schema.Types.Mixed,
      default: null,
    },

    // Kết quả trả về từ AI
    outputData: {
      type: Schema.Types.Mixed,
      default: null,
    },

    // -------------------------------------------
    // Token & Chi phí
    // -------------------------------------------
    tokensUsed: {
      input: { type: Number, default: 0 },
      output: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
    },

    // Chi phí ước tính (USD)
    cost: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Thời gian phản hồi (ms)
    latencyMs: {
      type: Number,
      default: 0,
      min: 0,
    },

    // -------------------------------------------
    // Trạng thái
    // -------------------------------------------
    status: {
      type: String,
      enum: {
        values: ['Success', 'Failed', 'Timeout'],
        message: 'Trạng thái phải là: Success, Failed, hoặc Timeout',
      },
      required: true,
    },

    errorMessage: {
      type: String,
      default: null,
    },

    // Tính năng AI nào đã sử dụng
    featureUsed: {
      type: String,
      enum: {
        values: [
          'GenerateTestCase',
          'WebAnalysis',
          'GenerateWebTestCase',
          'SuggestUserStory',
          'SuggestUserStoryFromGitHub',
          'RootCauseAnalysis',
          'SuggestSeverity',
          'DetectDuplicate',
          'ChatResponse',
          'Other',
        ],
        message: 'Tính năng AI không hợp lệ',
      },
      required: true,
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

    aiPrompt: {
      type: Schema.Types.ObjectId,
      ref: 'AiPrompt',
      default: null, // Prompt template đã sử dụng
    },
  },
  {
    timestamps: true,
    collection: 'ai_generation_logs',
  }
);

// =============================================
// Indexes
// =============================================
aiGenerationLogSchema.index({ user: 1, createdAt: -1 });
aiGenerationLogSchema.index({ project: 1, featureUsed: 1, createdAt: -1 });
aiGenerationLogSchema.index({ status: 1, createdAt: -1 });
aiGenerationLogSchema.index({ aiPrompt: 1 });

module.exports = mongoose.model('AiGenerationLog', aiGenerationLogSchema);
