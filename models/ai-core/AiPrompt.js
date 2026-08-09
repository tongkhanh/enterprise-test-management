/**
 * ============================================================
 * MODEL: AiPrompt (Cấu hình Prompt AI)
 * Phân hệ: Lõi Trí Tuệ Nhân Tạo (AI Core) 🌟
 * Collection: ai_prompts
 * ============================================================
 * Admin cấu hình câu lệnh (Prompt) trực tiếp trên UI,
 * không cần sửa code. Hỗ trợ biến động {{variable}}.
 * ============================================================
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const aiPromptSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Tên Prompt là bắt buộc'],
      trim: true,
      maxlength: [200, 'Tên Prompt không được quá 200 ký tự'],
    },

    description: {
      type: String,
      trim: true,
      default: '',
    },

    // Template Prompt chứa biến động
    // VD: "Hãy sinh Test Case cho chức năng: {{featureName}}. Yêu cầu: {{requirements}}"
    promptTemplate: {
      type: String,
      required: [true, 'Template Prompt là bắt buộc'],
    },

    category: {
      type: String,
      enum: {
        values: [
          'TestCaseGeneration',  // Sinh Test Case tự động
          'BugSeverity',         // Gợi ý Severity/Priority cho Bug
          'BugDuplicate',        // Phát hiện Bug trùng lặp
          'ChatAssistant',       // Trợ lý ảo QA (Chatbot RAG)
          'Custom',              // Tùy chỉnh
        ],
        message: 'Danh mục Prompt không hợp lệ',
      },
      required: [true, 'Danh mục Prompt là bắt buộc'],
    },

    // -------------------------------------------
    // Cấu hình Model AI
    // -------------------------------------------
    modelProvider: {
      type: String,
      enum: {
        values: ['OpenAI', 'GoogleAI', 'Anthropic'],
        message: 'Nhà cung cấp AI phải là: OpenAI, GoogleAI, hoặc Anthropic',
      },
      default: 'OpenAI',
    },

    modelName: {
      type: String,
      default: 'gpt-4o-mini',
      // VD: 'gpt-4o', 'gpt-4o-mini', 'gemini-pro', 'claude-3-sonnet'
    },

    temperature: {
      type: Number,
      default: 0.7,
      min: [0, 'Temperature phải >= 0'],
      max: [2, 'Temperature phải <= 2'],
    },

    maxTokens: {
      type: Number,
      default: 2048,
      min: [1, 'Max tokens phải >= 1'],
      max: [128000, 'Max tokens phải <= 128000'],
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    // Phiên bản prompt (để theo dõi lịch sử thay đổi)
    version: {
      type: Number,
      default: 1,
      min: 1,
    },

    // -------------------------------------------
    // Liên kết (References)
    // -------------------------------------------
    workspace: {
      type: Schema.Types.ObjectId,
      ref: 'Workspace',
      default: null, // null = prompt cấp hệ thống
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'ai_prompts',
  }
);

// =============================================
// Indexes
// =============================================
aiPromptSchema.index({ workspace: 1, category: 1, isActive: 1 });
aiPromptSchema.index({ category: 1, isActive: 1 });

module.exports = mongoose.model('AiPrompt', aiPromptSchema);
