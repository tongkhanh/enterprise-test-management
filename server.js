/**
 * ============================================================
 * SERVER.JS - ĐIỂM KHỞI ĐẦU ỨNG DỤNG EXPRESS
 * ============================================================
 * Enterprise Test Management System
 * ============================================================
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

const connectDB = require('./config/db');
const { errorHandler } = require('./middleware/error');
const { AppError } = require('./utils/http');
const { initializeReportSchedules } = require('./services/reportService');
const { recoverInterruptedAutomationJobs } = require('./services/automationRunnerService');
const { getAiStatus } = require('./services/aiService');
const { backfillApprovedBoardItems } = require('./services/boardService');
const { queueMode } = require('./services/queueService');

// Import Routes
const authRoutes = require('./routes/authRoutes');
const agileRoutes = require('./routes/agileRoutes');
const workspaceCollaborationRoutes = require('./routes/workspaceCollaborationRoutes');
const requirementRoutes = require('./routes/requirementRoutes');
const testDesignRoutes = require('./routes/testDesignRoutes');
const executionRoutes = require('./routes/executionRoutes');
const bugRoutes = require('./routes/bugRoutes');
const aiRoutes = require('./routes/aiRoutes');
const reportRoutes = require('./routes/reportRoutes');
const collaborationRoutes = require('./routes/collaborationRoutes');
const boardRoutes = require('./routes/boardRoutes');
const automationLabRoutes = require('./routes/automationLabRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const agileIssueRoutes = require('./routes/agileIssueRoutes');

const app = express();
app.set('trust proxy', 1);

// =============================================
// Middleware cơ bản
// =============================================
app.use(cors());                                     // Cho phép cross-origin
app.use(helmet({ contentSecurityPolicy: false }));   // Bảo mật HTTP headers
app.use(morgan('dev'));                               // HTTP request logging
app.use(express.json({ limit: '10mb', verify: (req, _res, buffer) => { if (req.originalUrl.startsWith('/api/v1/webhooks/')) req.rawBody = Buffer.from(buffer); } }));
app.use(express.urlencoded({ extended: true }));       // Parse URL-encoded body

// The React E2E workspace is the sole user-facing design flow.  Legacy page
// analyzer screens remain API-compatible for existing integrations, but are
// no longer reachable as a product UI.
app.get(['/', '/ai-core.html'], (_req, res) => res.redirect('/studio/'));

// =============================================
// Phục vụ static assets và artifact cũ
// =============================================
const publicPath = path.join(__dirname, 'public');
const studioBuildPath = path.join(publicPath, 'studio');
// The Studio keeps a signed-in user's Workspace context in the browser.  Do
// not let a browser reuse an old HTML/JS shell after a deployment: otherwise
// two browsers can render different permission states for the same account.
// Static assets are small in this local Docker setup, so freshness is more
// valuable than a long-lived cache.
const studioNoStore = 'no-store, no-cache, must-revalidate, proxy-revalidate';
app.use(express.static(publicPath, {
  setHeaders: (res, filePath) => {
    if (filePath.startsWith(studioBuildPath)) res.setHeader('Cache-Control', studioNoStore);
  },
}));

// Health phải được đăng ký trước các route động như /projects/:id.
app.get('/api/v1/health', (req, res) => {
  res.json({
    success: true,
    message: 'Enterprise Test Management System - API đang hoạt động!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: require('./package.json').version,
    ai: getAiStatus(),
    queues: queueMode(),
  });
});

// =============================================
// Mount API Routes (prefix /api/v1)
// =============================================
app.use('/api/v1/auth', authRoutes);
// Signed provider webhooks do not use browser JWT sessions.
app.use('/api/v1', webhookRoutes);
app.use('/observability', require('./routes/metricsRoutes'));
app.use('/api/v1', agileRoutes);
app.use('/api/v1', workspaceCollaborationRoutes);
app.use('/api/v1', requirementRoutes);
app.use('/api/v1', testDesignRoutes);
app.use('/api/v1', executionRoutes);
app.use('/api/v1', bugRoutes);
app.use('/api/v1/ai', aiRoutes);
app.use('/api/v1', require('./routes/e2eRoutes'));
app.use('/api/v1', reportRoutes);
app.use('/api/v1', collaborationRoutes);
app.use('/api/v1', boardRoutes);
app.use('/api/v1', automationLabRoutes);
app.use('/api/v1', agileIssueRoutes);
app.use('/api/v1', require('./routes/automationResourcesRoutes'));

// React AI Core Studio production build. Vite dev server vẫn dùng API tại :5000.
app.get('/studio/*', (req, res, next) => {
  const entry = path.join(studioBuildPath, 'index.html');
  res.setHeader('Cache-Control', studioNoStore);
  res.sendFile(entry, (error) => { if (error) next(); });
});

// API không tồn tại phải trả JSON thay vì rơi về trang HTML tĩnh.
app.use('/api', (req, res, next) => next(new AppError(`Không tìm thấy endpoint ${req.method} ${req.originalUrl}.`, 404)));

// =============================================
// Global Error Handler (phải đặt cuối cùng)
// =============================================
app.use(errorHandler);

// =============================================
// Khởi động Server
// =============================================
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    // Kết nối MongoDB Atlas
    await connectDB();

    await require('./controllers/authController').ensureRoles();

    const backfilledBoardItems = await backfillApprovedBoardItems();
    if (backfilledBoardItems) console.log(`Đã đồng bộ ${backfilledBoardItems} Test Case Approved cũ vào Backlog.`);

    await initializeReportSchedules();
    require('./services/automationResourcesService').initializeAutomationSchedules();
    require('./services/automationResourcesService').startHeartbeat('api');
    require('./services/automationResourcesService').startWorkerWatchdog();
    require('./services/automationResourcesService').startWorkerWatchdog();
    await recoverInterruptedAutomationJobs();
    return app.listen(PORT, () => {
      console.log('');
      console.log('============================================');
      console.log('  🚀 ENTERPRISE TEST MANAGEMENT SYSTEM');
      console.log('============================================');
      console.log(`  🌐 Server:    http://localhost:${PORT}`);
      console.log(`  📡 API:       http://localhost:${PORT}/api/v1`);
      console.log(`  🧪 Test UI:   http://localhost:${PORT}`);
      console.log(`  💚 Health:    http://localhost:${PORT}/api/v1/health`);
      console.log(`  🔧 Env:       ${process.env.NODE_ENV}`);
      console.log('============================================');
      console.log('');
    });
  } catch (error) {
    console.error('❌ Không thể khởi động server:', error.message);
    process.exit(1);
  }
};

if (require.main === module) startServer();

module.exports = { app, startServer };
