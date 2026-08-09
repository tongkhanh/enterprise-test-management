/**
 * ============================================================
 * MODEL: CustomDashboard (Dashboard tùy chỉnh)
 * Phân hệ: Báo cáo, Đánh giá & Tiện ích (Reports & Gamification)
 * Collection: custom_dashboards
 * ============================================================
 * Lưu cấu hình giao diện Dashboard cá nhân:
 * Kéo thả, chọn biểu đồ, bố cục widgets.
 * Mỗi user có thể có nhiều dashboard riêng.
 * ============================================================
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

// -------------------------------------------
// Sub-schema: Widget (Thành phần biểu đồ)
// -------------------------------------------
const widgetSchema = new Schema(
  {
    type: {
      type: String,
      enum: [
        'BarChart', 'PieChart', 'LineChart', 'DoughnutChart',
        'Table', 'Counter', 'Heatmap', 'Gauge',
      ],
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    // Cấu hình biểu đồ (filter, data source, v.v.)
    config: {
      type: Schema.Types.Mixed,
      default: {},
    },
    // Vị trí & kích thước trên lưới
    position: {
      x: { type: Number, default: 0 },
      y: { type: Number, default: 0 },
      width: { type: Number, default: 6 },
      height: { type: Number, default: 4 },
    },
  },
  { _id: true }
);

const customDashboardSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Tên Dashboard là bắt buộc'],
      trim: true,
    },

    description: {
      type: String,
      trim: true,
      default: '',
    },

    isDefault: {
      type: Boolean,
      default: false, // Dashboard mặc định khi mở trang
    },

    // Cấu hình bố cục tổng thể (grid layout)
    layout: {
      type: Schema.Types.Mixed,
      default: {},
    },

    // -------------------------------------------
    // Embedded: Danh sách Widgets
    // -------------------------------------------
    widgets: [widgetSchema],

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
    collection: 'custom_dashboards',
  }
);

// =============================================
// Indexes
// =============================================
customDashboardSchema.index({ user: 1, project: 1 });
customDashboardSchema.index({ user: 1, isDefault: 1 });

module.exports = mongoose.model('CustomDashboard', customDashboardSchema);
