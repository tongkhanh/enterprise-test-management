/**
 * ============================================================
 * MODEL: ScheduledReport (Báo cáo tự động)
 * Phân hệ: Báo cáo, Đánh giá & Tiện ích (Reports & Gamification)
 * Collection: scheduled_reports
 * ============================================================
 * Lên lịch xuất file Excel/PDF và gửi email tự động.
 * VD: Gửi báo cáo tổng hợp Bug vào 8h sáng thứ 2 hàng tuần.
 * ============================================================
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const scheduledReportSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Tên báo cáo là bắt buộc'],
      trim: true,
    },

    reportType: {
      type: String,
      enum: {
        values: ['BugSummary', 'TestCoverage', 'SprintReport', 'ExecutionReport', 'KPIReport', 'Custom'],
        message: 'Loại báo cáo không hợp lệ',
      },
      required: [true, 'Loại báo cáo là bắt buộc'],
    },

    format: {
      type: String,
      enum: {
        values: ['PDF', 'Excel', 'CSV'],
        message: 'Định dạng phải là: PDF, Excel, hoặc CSV',
      },
      default: 'PDF',
    },

    // Cron expression cho lịch gửi
    // VD: "0 8 * * 1" = 8h sáng thứ 2 hàng tuần
    cronExpression: {
      type: String,
      required: [true, 'Cron expression là bắt buộc'],
    },

    // Danh sách email nhận báo cáo
    recipients: [
      {
        type: String,
        match: [/^\S+@\S+\.\S+$/, 'Email không hợp lệ'],
      },
    ],

    lastRunAt: {
      type: Date,
      default: null,
    },

    nextRunAt: {
      type: Date,
      default: null,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    // Bộ lọc dữ liệu cho báo cáo
    filters: {
      type: Schema.Types.Mixed,
      default: {},
      // VD: { severity: ['Critical', 'Major'], dateRange: { from: '...', to: '...' } }
    },

    // -------------------------------------------
    // Liên kết (References)
    // -------------------------------------------
    project: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: [true, 'Dự án là bắt buộc'],
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'scheduled_reports',
  }
);

// =============================================
// Indexes
// =============================================
scheduledReportSchema.index({ project: 1, isActive: 1 });
scheduledReportSchema.index({ nextRunAt: 1, isActive: 1 });

module.exports = mongoose.model('ScheduledReport', scheduledReportSchema);
