/**
 * ============================================================
 * MODEL: KnowledgeBase (Kho tài liệu Vector hóa - RAG)
 * Phân hệ: Lõi Trí Tuệ Nhân Tạo (AI Core) 🌟
 * Collection: knowledge_bases
 * ============================================================
 * Kho tài liệu đã được Vector hóa (RAG - Retrieval Augmented
 * Generation) giúp AI đọc hiểu nghiệp vụ dự án để trả lời
 * Chatbot chính xác.
 *
 * Quy trình: Tài liệu gốc → Chia chunk → Embedding → Lưu vào đây
 *           → Khi user hỏi → Vector Search tìm chunk liên quan
 *           → Gửi context cho LLM → Trả lời chính xác
 *
 * ⚡ HƯỚNG DẪN TẠO ATLAS VECTOR SEARCH INDEX:
 * ============================================================
 * Sau khi deploy collection này lên MongoDB Atlas, bạn cần tạo
 * Vector Search Index thủ công trên giao diện Atlas:
 *
 * Bước 1: Truy cập MongoDB Atlas Dashboard → chọn Cluster
 * Bước 2: Vào tab "Atlas Search" → Click "Create Search Index"
 * Bước 3: Chọn "Atlas Vector Search" → "JSON Editor"
 * Bước 4: Chọn Database và Collection "knowledge_bases"
 * Bước 5: Đặt tên Index, ví dụ: "knowledge_vector_index"
 * Bước 6: Paste cấu hình JSON sau:
 *
 * {
 *   "fields": [
 *     {
 *       "type": "vector",
 *       "path": "embedding",
 *       "numDimensions": 1536,
 *       "similarity": "cosine"
 *     },
 *     {
 *       "type": "filter",
 *       "path": "project"
 *     },
 *     {
 *       "type": "filter",
 *       "path": "isActive"
 *     }
 *   ]
 * }
 *
 * Bước 7: Click "Create Search Index" và đợi index được build.
 *
 * 🔍 CÁCH SỬ DỤNG VECTOR SEARCH TRONG CODE (RAG):
 *
 * // Bước 1: Tạo embedding cho câu hỏi của user
 * const queryEmbedding = await openai.embeddings.create({
 *   model: "text-embedding-3-small",
 *   input: userQuestion,
 * });
 *
 * // Bước 2: Tìm kiếm tài liệu liên quan bằng Vector Search
 * const relevantDocs = await KnowledgeBase.aggregate([
 *   {
 *     $vectorSearch: {
 *       index: "knowledge_vector_index",
 *       path: "embedding",
 *       queryVector: queryEmbedding.data[0].embedding,
 *       numCandidates: 150,
 *       limit: 5,
 *       filter: {
 *         $and: [
 *           { project: projectObjectId },
 *           { isActive: true }
 *         ]
 *       }
 *     }
 *   },
 *   {
 *     $project: {
 *       title: 1,
 *       content: 1,
 *       score: { $meta: "vectorSearchScore" }
 *     }
 *   }
 * ]);
 *
 * // Bước 3: Ghép context và gửi cho LLM
 * const context = relevantDocs.map(d => d.content).join("\n\n");
 * const response = await openai.chat.completions.create({
 *   model: "gpt-4o-mini",
 *   messages: [
 *     { role: "system", content: `Trả lời dựa trên context:\n${context}` },
 *     { role: "user", content: userQuestion }
 *   ]
 * });
 *
 * ============================================================
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const knowledgeBaseSchema = new Schema(
  {
    title: {
      type: String,
      required: [true, 'Tiêu đề tài liệu là bắt buộc'],
      trim: true,
    },

    // Nội dung chunk (đoạn văn bản đã chia nhỏ)
    content: {
      type: String,
      required: [true, 'Nội dung là bắt buộc'],
    },

    // Nguồn tài liệu
    source: {
      type: String,
      enum: {
        values: ['Manual', 'Upload', 'Crawl'],
        message: 'Nguồn tài liệu phải là: Manual, Upload, hoặc Crawl',
      },
      default: 'Manual',
    },

    // URL file gốc (nếu upload)
    fileUrl: {
      type: String,
      default: null,
    },

    // Thứ tự chunk trong tài liệu gốc
    chunkIndex: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Tổng số chunks của tài liệu gốc
    totalChunks: {
      type: Number,
      default: 1,
      min: 1,
    },

    // ============================================================
    // ⚡ TRƯỜNG VECTOR EMBEDDING
    // Mảng số thực đại diện cho nội dung tài liệu trong không gian vector.
    // Dùng cho RAG: tìm tài liệu liên quan khi user hỏi Chatbot.
    // ============================================================
    embedding: {
      type: [Number],
      required: [true, 'Vector embedding là bắt buộc'],
      validate: {
        validator: function (arr) {
          return arr.length === this.dimensions;
        },
        message: 'Kích thước vector phải khớp với trường dimensions',
      },
    },

    // Model đã dùng để tạo embedding
    embeddingModel: {
      type: String,
      default: 'gemini-embedding-001',
    },

    // Số chiều của vector
    dimensions: {
      type: Number,
      default: 1536,
      enum: [256, 512, 768, 1024, 1536, 3072],
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

    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Người upload là bắt buộc'],
    },
  },
  {
    timestamps: true,
    collection: 'knowledge_bases',
  }
);

// =============================================
// Indexes
// =============================================
knowledgeBaseSchema.index({ project: 1, isActive: 1 });
knowledgeBaseSchema.index({ source: 1 });
knowledgeBaseSchema.index({ title: 'text', content: 'text' }); // Full-text search fallback
// ⚡ LƯU Ý: Vector Search Index phải được tạo TRÊN ATLAS UI
// (Không thể tạo bằng Mongoose, xem hướng dẫn ở trên)

module.exports = mongoose.model('KnowledgeBase', knowledgeBaseSchema);
