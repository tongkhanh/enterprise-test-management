/**
 * ============================================================
 * MIDDLEWARE: XỬ LÝ LỖI TẬP TRUNG (GLOBAL ERROR HANDLER)
 * ============================================================
 * Xử lý tất cả lỗi từ Mongoose và ứng dụng, trả về JSON chuẩn.
 * ============================================================
 */

const { AuditLog } = require('../models');

const sanitizeAuditValue = (value, depth = 0) => {
  if (value == null || depth > 8) return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitizeAuditValue(item, depth + 1));
  if (typeof value !== 'object') return typeof value === 'string' ? value.slice(0, 5000) : value;
  const source = value.toObject ? value.toObject() : value;
  return Object.fromEntries(Object.entries(source).map(([key, item]) => [
    key,
    /(password|token|secret|credential|ciphertext|inviteUrl|authorization)/i.test(key)
      ? '[REDACTED]'
      : sanitizeAuditValue(item, depth + 1),
  ]));
};

/**
 * Global Error Handler Middleware
 * Phải đặt sau tất cả routes trong server.js
 */
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log lỗi trong môi trường development
  if (process.env.NODE_ENV === 'development') {
    console.error('❌ Error:', err);
  }

  // ---- Xử lý lỗi Mongoose ----

  // 1. CastError: ID không hợp lệ (VD: ObjectId sai định dạng)
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      error: `Giá trị '${err.value}' không phải là ID hợp lệ.`
    });
  }

  // 2. ValidationError: Lỗi validation từ schema
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(val => val.message);
    return res.status(400).json({
      success: false,
      error: 'Dữ liệu không hợp lệ.',
      details: messages
    });
  }

  // 3. Duplicate Key Error (code 11000)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const value = err.keyValue[field];
    return res.status(409).json({
      success: false,
      error: `Giá trị '${value}' cho trường '${field}' đã tồn tại. Vui lòng sử dụng giá trị khác.`
    });
  }

  // 4. JWT Errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: 'Token không hợp lệ.'
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: 'Token đã hết hạn. Vui lòng đăng nhập lại.'
    });
  }

  // 5. Lỗi chung
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    error: error.message || 'Lỗi máy chủ nội bộ (Internal Server Error).',
    ...(err.details && { details: err.details }),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

/**
 * Middleware ghi Audit Log cho các hành động quan trọng
 * Sử dụng: auditLog('UPDATE', 'Bug')
 */
const auditLog = (action, entityType) => {
  return async (req, res, next) => {
    // Lưu hàm json gốc để ghi log sau khi response
    const originalJson = res.json.bind(res);

    res.json = async function (body) {
      // Chỉ ghi log khi thành công
      if (body && body.success !== false && req.user) {
        try {
          const entityId = req._auditEntityId || req.params.membershipId || req.params.id || body.data?._id;
          if (!entityId) return originalJson(body);
          await AuditLog.create({
            performedBy: req.user._id,
            workspace: req.user.workspace || null,
            action: action,
            entityType: entityType,
            entityId,
            description: `${req.user.fullName || req.user.email} đã thực hiện ${action} trên ${entityType}`,
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.headers['user-agent'],
            changes: {
              before: sanitizeAuditValue(req._auditBefore || null),
              after: sanitizeAuditValue(req._auditAfter || body.data || null)
            }
          });
        } catch (auditErr) {
          console.error('⚠️ Audit log error:', auditErr.message);
        }
      }

      return originalJson(body);
    };

    next();
  };
};

/**
 * Wrapper async cho controller (thay try-catch)
 * Sử dụng: router.get('/', asyncHandler(getUsers));
 */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { errorHandler, auditLog, asyncHandler, sanitizeAuditValue };
