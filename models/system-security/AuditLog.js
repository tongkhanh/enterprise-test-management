/**
 * ============================================================
 * MODEL: AuditLog (Nhật ký hoạt động)
 * Phân hệ: Quản trị & Bảo mật Hệ thống (System & Security)
 * Collection: audit_logs
 * ============================================================
 * Ghi vết toàn bộ hoạt động hệ thống (Audit Trail):
 * Ai đã thao tác gì, lúc nào, thay đổi gì (before/after).
 * VD: "User A đã chuyển trạng thái Bug #123 thành Resolved lúc 14:00"
 * ============================================================
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const auditLogSchema = new Schema(
  {
    // -------------------------------------------
    // Liên kết (References)
    // -------------------------------------------
    performedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Người thực hiện là bắt buộc'],
    },

    workspace: {
      type: Schema.Types.ObjectId,
      ref: 'Workspace',
      default: null,
    },

    // -------------------------------------------
    // Thông tin hành động
    // -------------------------------------------
    action: {
      type: String,
      required: [true, 'Hành động là bắt buộc'],
      enum: {
        values: [
          'CREATE', 'UPDATE', 'DELETE',
          'LOGIN', 'LOGOUT',
          'ASSIGN', 'UNASSIGN',
          'STATUS_CHANGE',
          'APPROVE', 'REJECT',
          'EXPORT', 'IMPORT',
          'PERMISSION_CHANGE',
          'INVITE', 'CANCEL', 'ARCHIVE',
        ],
        message: 'Hành động không hợp lệ',
      },
    },

    // Entity (đối tượng) bị tác động
    entityType: {
      type: String,
      required: true,
      // VD: 'Bug', 'TestCase', 'User', 'Project', v.v.
    },

    entityId: {
      type: Schema.Types.ObjectId,
      required: true,
    },

    // Mô tả hành động dạng text
    description: {
      type: String,
      default: '',
      // VD: "User A đã chuyển trạng thái Bug #123 thành Resolved"
    },

    // Lưu trữ dữ liệu trước/sau thay đổi
    changes: {
      before: {
        type: Schema.Types.Mixed,
        default: null,
      },
      after: {
        type: Schema.Types.Mixed,
        default: null,
      },
    },

    // -------------------------------------------
    // Metadata
    // -------------------------------------------
    ipAddress: {
      type: String,
      default: null,
    },

    userAgent: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'audit_logs',
  }
);

// =============================================
// Indexes
// =============================================
auditLogSchema.index({ performedBy: 1, createdAt: -1 });
auditLogSchema.index({ entityType: 1, entityId: 1 });
auditLogSchema.index({ workspace: 1, action: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 }); // Sắp xếp theo thời gian mới nhất

module.exports = mongoose.model('AuditLog', auditLogSchema);
