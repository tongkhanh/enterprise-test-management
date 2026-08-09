/**
 * ============================================================
 * MODEL: RiskAssessment (Đánh giá rủi ro)
 * Phân hệ: Báo cáo, Đánh giá & Tiện ích (Reports & Gamification)
 * Collection: risk_assessments
 * ============================================================
 * Bảng đánh giá rủi ro dự án:
 * Tính năng nào đang có nhiều Bug Critical nhất?
 * Cảnh báo rủi ro trước khi Release.
 * ============================================================
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const riskAssessmentSchema = new Schema(
  {
    title: {
      type: String,
      required: [true, 'Tiêu đề đánh giá là bắt buộc'],
      trim: true,
    },

    description: {
      type: String,
      trim: true,
      default: '',
    },

    riskLevel: {
      type: String,
      enum: {
        values: ['Critical', 'High', 'Medium', 'Low'],
        message: 'Mức độ rủi ro phải là: Critical, High, Medium, hoặc Low',
      },
      required: [true, 'Mức độ rủi ro là bắt buộc'],
    },

    category: {
      type: String,
      enum: {
        values: ['Technical', 'Schedule', 'Resource', 'Quality', 'Scope', 'External'],
        message: 'Danh mục rủi ro không hợp lệ',
      },
      required: [true, 'Danh mục rủi ro là bắt buộc'],
    },

    // Xác suất xảy ra (1-5)
    likelihood: {
      type: Number,
      min: [1, 'Xác suất phải từ 1 đến 5'],
      max: [5, 'Xác suất phải từ 1 đến 5'],
      default: 3,
    },

    // Mức độ ảnh hưởng (1-5)
    impact: {
      type: Number,
      min: [1, 'Mức ảnh hưởng phải từ 1 đến 5'],
      max: [5, 'Mức ảnh hưởng phải từ 1 đến 5'],
      default: 3,
    },

    // Kế hoạch giảm thiểu rủi ro
    mitigationPlan: {
      type: String,
      default: '',
    },

    status: {
      type: String,
      enum: {
        values: ['Identified', 'Mitigating', 'Resolved', 'Accepted'],
        message: 'Trạng thái phải là: Identified, Mitigating, Resolved, hoặc Accepted',
      },
      default: 'Identified',
    },

    assessedAt: {
      type: Date,
      default: Date.now,
    },

    // -------------------------------------------
    // Liên kết (References)
    // -------------------------------------------
    project: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: [true, 'Dự án là bắt buộc'],
    },

    release: {
      type: Schema.Types.ObjectId,
      ref: 'Release',
      default: null,
    },

    assessedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Người đánh giá là bắt buộc'],
    },
  },
  {
    timestamps: true,
    collection: 'risk_assessments',
  }
);

// =============================================
// Indexes
// =============================================
riskAssessmentSchema.index({ project: 1, riskLevel: 1, status: 1 });
riskAssessmentSchema.index({ release: 1, riskLevel: 1 });

module.exports = mongoose.model('RiskAssessment', riskAssessmentSchema);
