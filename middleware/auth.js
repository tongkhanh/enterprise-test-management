/**
 * ============================================================
 * MIDDLEWARE: XÁC THỰC JWT & KIỂM TRA SESSION
 * ============================================================
 * - Đọc JWT từ header Authorization: Bearer <token>
 * - Verify token → lấy userId
 * - Kiểm tra session còn isActive trong user_sessions
 * - Gắn req.user cho các middleware/controller phía sau
 * ============================================================
 */

const jwt = require('jsonwebtoken');
const { User, UserSession } = require('../models');

/**
 * Middleware xác thực - Bắt buộc đăng nhập
 */
const protect = async (req, res, next) => {
  try {
    let token;

    // 1. Đọc token từ header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Bạn chưa đăng nhập. Vui lòng đăng nhập để tiếp tục.'
      });
    }

    // 2. Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
        });
      }
      return res.status(401).json({
        success: false,
        error: 'Token không hợp lệ.'
      });
    }

    // 3. Kiểm tra session trong DB (hỗ trợ kick thiết bị)
    const session = await UserSession.findOne({
      _id: decoded.sessionId,
      user: decoded.id,
      isActive: true
    });

    if (!session) {
      return res.status(401).json({
        success: false,
        error: 'Phiên đăng nhập đã bị vô hiệu hóa (bạn có thể đã bị đăng xuất từ xa).'
      });
    }

    // 4. Kiểm tra user còn tồn tại và active
    const user = await User.findById(decoded.id).populate('role');
    if (!user || user.status !== 'active') {
      return res.status(401).json({
        success: false,
        error: 'Tài khoản không tồn tại hoặc đã bị vô hiệu hóa.'
      });
    }

    // 5. Cập nhật lastActivityAt cho session
    session.lastActivityAt = new Date();
    await session.save({ validateBeforeSave: false });

    // 6. Gắn thông tin vào request
    req.user = user;
    req.sessionId = decoded.sessionId;
    req.token = token;

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware tùy chọn - Không bắt buộc đăng nhập nhưng nếu có token thì parse user
 */
const optionalAuth = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).populate('role');
        if (user && user.status === 'active') {
          req.user = user;
          req.sessionId = decoded.sessionId;
        }
      } catch (err) {
        // Token không hợp lệ → bỏ qua, không chặn request
      }
    }

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { protect, optionalAuth };
