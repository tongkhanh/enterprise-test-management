/**
 * ============================================================
 * MODEL: UserKpi (Gamification - Điểm KPI)
 * Phân hệ: Báo cáo, Đánh giá & Tiện ích (Reports & Gamification)
 * Collection: user_kpis
 * ============================================================
 * Hệ thống điểm số Gamification để tạo động lực cho Tester:
 * - Cộng 10 điểm nếu bắt được Bug Critical
 * - Cộng 5 điểm cho Bug Major
 * - Cộng 2 điểm cho mỗi Test Case viết
 * - Trừ 5 điểm nếu viết Test Case sai (bị Reject)
 * ============================================================
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

// -------------------------------------------
// Sub-schema: Lịch sử thay đổi điểm
// -------------------------------------------
const pointsHistorySchema = new Schema(
  {
    points: {
      type: Number,
      required: true,
      // Dương = cộng điểm, Âm = trừ điểm
    },
    reason: {
      type: String,
      required: true,
      // VD: "Phát hiện Bug Critical #BUG-456"
    },
    date: {
      type: Date,
      default: Date.now,
    },
    // Entity liên quan (Bug, TestCase, v.v.)
    relatedEntity: {
      entityType: { type: String, default: null },
      entityId: { type: Schema.Types.ObjectId, default: null },
    },
  },
  { _id: true }
);

const userKpiSchema = new Schema(
  {
    // -------------------------------------------
    // Tổng điểm & Xếp hạng
    // -------------------------------------------
    totalPoints: {
      type: Number,
      default: 0,
    },

    rank: {
      type: String,
      default: 'Rookie',
      // VD: "Rookie", "Bronze", "Silver", "Gold", "Platinum", "Diamond"
    },

    // Huy hiệu đặc biệt
    badges: {
      type: [String],
      default: [],
      // VD: ["Bug Hunter", "Test Master", "Speed Runner", "Critical Finder"]
    },

    // -------------------------------------------
    // Thống kê chi tiết
    // -------------------------------------------
    bugsFound: {
      total: { type: Number, default: 0, min: 0 },
      critical: { type: Number, default: 0, min: 0 },
      major: { type: Number, default: 0, min: 0 },
      minor: { type: Number, default: 0, min: 0 },
      trivial: { type: Number, default: 0, min: 0 },
    },

    testCasesWritten: {
      type: Number,
      default: 0,
      min: 0,
    },

    testCasesExecuted: {
      type: Number,
      default: 0,
      min: 0,
    },

    retestsDone: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Kỳ đánh giá
    period: {
      type: String,
      enum: {
        values: ['weekly', 'monthly', 'quarterly', 'yearly', 'all-time'],
        message: 'Kỳ đánh giá không hợp lệ',
      },
      default: 'monthly',
    },

    // Tháng/Quý/Năm tương ứng
    periodValue: {
      type: String,
      default: null,
      // VD: "2026-08" cho monthly, "2026-Q3" cho quarterly, "2026" cho yearly
    },

    // -------------------------------------------
    // Embedded: Lịch sử thay đổi điểm
    // -------------------------------------------
    pointsHistory: [pointsHistorySchema],

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
      required: [true, 'Dự án là bắt buộc'],
    },
  },
  {
    timestamps: true,
    collection: 'user_kpis',
  }
);

// =============================================
// Indexes
// =============================================
userKpiSchema.index({ user: 1, project: 1, period: 1, periodValue: 1 }, { unique: true });
userKpiSchema.index({ project: 1, totalPoints: -1 }); // Leaderboard
userKpiSchema.index({ user: 1, period: 1 });

module.exports = mongoose.model('UserKpi', userKpiSchema);
