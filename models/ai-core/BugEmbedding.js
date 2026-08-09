/**
 * ============================================================
 * MODEL: BugEmbedding (Vector nhúng Bug)
 * Phân hệ: Lõi Trí Tuệ Nhân Tạo (AI Core) 🌟
 * Collection: bug_embeddings
 * ============================================================
 * Lưu các chuỗi số Vector (embedding) của Bug để thực hiện
 * tính năng TÌM KIẾM LỖI TRÙNG LẶP siêu tốc bằng
 * MongoDB Atlas Vector Search.
 *
 * ⚡ HƯỚNG DẪN TẠO ATLAS VECTOR SEARCH INDEX:
 * ============================================================
 * Sau khi deploy collection này lên MongoDB Atlas, bạn cần tạo
 * Vector Search Index thủ công trên giao diện Atlas:
 *
 * Bước 1: Truy cập MongoDB Atlas Dashboard → chọn Cluster
 * Bước 2: Vào tab "Atlas Search" → Click "Create Search Index"
 * Bước 3: Chọn "Atlas Vector Search" → "JSON Editor"
 * Bước 4: Chọn Database và Collection "bug_embeddings"
 * Bước 5: Đặt tên Index, ví dụ: "bug_vector_index"
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
 *     }
 *   ]
 * }
 *
 * Bước 7: Click "Create Search Index" và đợi index được build.
 *
 * 📌 LƯU Ý:
 * - numDimensions: 1536 tương ứng với model "text-embedding-ada-002"
 *   hoặc "text-embedding-3-small" của OpenAI.
 *   Nếu dùng model khác (VD: Gemini embedding = 768 chiều),
 *   hãy thay đổi numDimensions cho phù hợp.
 * - similarity: "cosine" phù hợp cho hầu hết các use case NLP.
 *   Các lựa chọn khác: "euclidean", "dotProduct".
 *
 * 🔍 CÁCH SỬ DỤNG VECTOR SEARCH TRONG CODE:
 *
 * const results = await BugEmbedding.aggregate([
 *   {
 *     $vectorSearch: {
 *       index: "bug_vector_index",
 *       path: "embedding",
 *       queryVector: [0.1, 0.2, ...], // Vector của bug mới
 *       numCandidates: 100,
 *       limit: 5,
 *       filter: { project: projectObjectId }
 *     }
 *   },
 *   {
 *     $project: {
 *       bug: 1,
 *       textContent: 1,
 *       score: { $meta: "vectorSearchScore" }
 *     }
 *   }
 * ]);
 *
 * ============================================================
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const bugEmbeddingSchema = new Schema(
  {
    // Nội dung gốc đã được vector hóa
    // (thường là: title + description + stepsToReproduce của Bug)
    textContent: {
      type: String,
      required: [true, 'Nội dung gốc là bắt buộc'],
    },

    // ============================================================
    // ⚡ TRƯỜNG VECTOR EMBEDDING
    // Mảng số thực đại diện cho nội dung Bug trong không gian vector.
    // Kích thước mặc định: 1536 chiều (OpenAI text-embedding-ada-002)
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
      default: 'text-embedding-3-small',
      // VD: 'text-embedding-ada-002', 'text-embedding-3-small', 'text-embedding-3-large'
    },

    // Số chiều của vector
    dimensions: {
      type: Number,
      default: 1536,
      enum: [256, 512, 768, 1024, 1536, 3072],
    },

    // -------------------------------------------
    // Liên kết (References)
    // -------------------------------------------
    bug: {
      type: Schema.Types.ObjectId,
      ref: 'Bug',
      required: [true, 'Bug là bắt buộc'],
      unique: true, // Mỗi Bug chỉ có 1 embedding
    },

    project: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: [true, 'Dự án là bắt buộc'],
    },
  },
  {
    timestamps: true,
    collection: 'bug_embeddings',
  }
);

// =============================================
// Indexes
// =============================================
bugEmbeddingSchema.index({ bug: 1 }, { unique: true });
bugEmbeddingSchema.index({ project: 1 });
// ⚡ LƯU Ý: Vector Search Index phải được tạo TRÊN ATLAS UI
// (Không thể tạo bằng Mongoose, xem hướng dẫn ở trên)

module.exports = mongoose.model('BugEmbedding', bugEmbeddingSchema);
