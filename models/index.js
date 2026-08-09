/**
 * ============================================================
 * BARREL EXPORT - TẤT CẢ 32 MONGOOSE MODELS
 * ============================================================
 * Import tập trung tất cả models từ 8 phân hệ.
 *
 * Cách sử dụng:
 *   const { User, Bug, TestCase } = require('./models');
 *   // hoặc
 *   const models = require('./models');
 *   const user = await models.User.findById(id);
 * ============================================================
 */

// =============================================
// Phân hệ 1: Quản trị & Bảo mật Hệ thống
// (System & Security) - 4 Models
// =============================================
const User = require('./system-security/User');
const Role = require('./system-security/Role');
const UserSession = require('./system-security/UserSession');
const AuditLog = require('./system-security/AuditLog');

// =============================================
// Phân hệ 2: Quản lý Đa dự án & Agile
// (Workspace & Agile) - 4 Models
// =============================================
const Workspace = require('./workspace-agile/Workspace');
const Project = require('./workspace-agile/Project');
const Sprint = require('./workspace-agile/Sprint');
const Release = require('./workspace-agile/Release');

// =============================================
// Phân hệ 3: Quản lý Yêu cầu & Tài liệu
// (Requirements & Docs) - 3 Models
// =============================================
const UserStory = require('./requirements-docs/UserStory');
const Comment = require('./requirements-docs/Comment');
const DesignMockup = require('./requirements-docs/DesignMockup');

// =============================================
// Phân hệ 4: Thiết kế Kiểm thử
// (Test Design) - 4 Models
// =============================================
const TestSuite = require('./test-design/TestSuite');
const TestCase = require('./test-design/TestCase');
const SharedTestData = require('./test-design/SharedTestData');
const ReviewRequest = require('./test-design/ReviewRequest');

// =============================================
// Phân hệ 5: Thực thi & Tích hợp Tự động
// (Execution & Automation) - 4 Models
// =============================================
const TestPlan = require('./execution-automation/TestPlan');
const TestRun = require('./execution-automation/TestRun');
const TestExecution = require('./execution-automation/TestExecution');
const AutomationResult = require('./execution-automation/AutomationResult');

// =============================================
// Phân hệ 6: Quản lý Lỗi
// (Bug Tracking) - 3 Models
// =============================================
const Bug = require('./bug-tracking/Bug');
const BugHistory = require('./bug-tracking/BugHistory');
const BugRetest = require('./bug-tracking/BugRetest');

// =============================================
// Phân hệ 7: Lõi Trí Tuệ Nhân Tạo
// (AI Core) 🌟 - 5 Models
// =============================================
const AiPrompt = require('./ai-core/AiPrompt');
const AiGenerationLog = require('./ai-core/AiGenerationLog');
const BugEmbedding = require('./ai-core/BugEmbedding');
const AiChatSession = require('./ai-core/AiChatSession');
const KnowledgeBase = require('./ai-core/KnowledgeBase');

// =============================================
// Phân hệ 8: Báo cáo, Đánh giá & Tiện ích
// (Reports & Gamification) - 5 Models
// =============================================
const CustomDashboard = require('./reports-gamification/CustomDashboard');
const ScheduledReport = require('./reports-gamification/ScheduledReport');
const Notification = require('./reports-gamification/Notification');
const RiskAssessment = require('./reports-gamification/RiskAssessment');
const UserKpi = require('./reports-gamification/UserKpi');

// =============================================
// Export tất cả 32 Models
// =============================================
module.exports = {
  // Phân hệ 1: System & Security
  User,
  Role,
  UserSession,
  AuditLog,

  // Phân hệ 2: Workspace & Agile
  Workspace,
  Project,
  Sprint,
  Release,

  // Phân hệ 3: Requirements & Docs
  UserStory,
  Comment,
  DesignMockup,

  // Phân hệ 4: Test Design
  TestSuite,
  TestCase,
  SharedTestData,
  ReviewRequest,

  // Phân hệ 5: Execution & Automation
  TestPlan,
  TestRun,
  TestExecution,
  AutomationResult,

  // Phân hệ 6: Bug Tracking
  Bug,
  BugHistory,
  BugRetest,

  // Phân hệ 7: AI Core 🌟
  AiPrompt,
  AiGenerationLog,
  BugEmbedding,
  AiChatSession,
  KnowledgeBase,

  // Phân hệ 8: Reports & Gamification
  CustomDashboard,
  ScheduledReport,
  Notification,
  RiskAssessment,
  UserKpi,
};
