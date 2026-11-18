/**
 * ============================================================
 * MODEL: TestCase (Kịch bản kiểm thử)
 * Phân hệ: Thiết kế Kiểm thử (Test Design)
 * Collection: test_cases
 * ============================================================
 * Lưu trữ toàn bộ dữ liệu 1 kịch bản kiểm thử:
 * Tiêu đề, Mô tả, Điều kiện tiên quyết, Loại test,
 * và mảng Test Steps (embedded subdocument) nằm ngay trong đây.
 * ============================================================
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

// -------------------------------------------
// Sub-schema: Test Step (Bước kiểm thử)
// -------------------------------------------
const testStepSchema = new Schema(
  {
    stepNumber: {
      type: Number,
      required: [true, 'Số thứ tự bước là bắt buộc'],
    },
    action: {
      type: String,
      required: [true, 'Hành động là bắt buộc'],
      // VD: "Nhập email 'test@gmail.com' vào ô Email"
    },
    expectedResult: {
      type: String,
      required: [true, 'Kết quả mong đợi là bắt buộc'],
      // VD: "Hệ thống hiển thị trang Dashboard"
    },
    testData: {
      type: String,
      default: '',
      // VD: "Email: test@gmail.com, Password: 123456"
    },
    automationAction: {
      type: String,
      enum: ['goto', 'click', 'fill', 'select', 'check', 'uncheck', 'press', 'assertText', 'assertVisible', 'assertUrl', 'waitForResponse', 'manual'],
      default: 'manual',
    },
    locator: {
      type: Schema.Types.Mixed,
      default: null,
    },
    value: {
      type: String,
      default: '',
    },
  },
  { _id: false } // Không tạo _id riêng cho mỗi step
);

const testCaseSchema = new Schema(
  {
    title: {
      type: String,
      required: [true, 'Tiêu đề Test Case là bắt buộc'],
      trim: true,
      maxlength: [500, 'Tiêu đề không được quá 500 ký tự'],
    },

    description: {
      type: String,
      trim: true,
      default: '',
    },
    testCaseId: { type: String, trim: true, default: '' },
    objective: { type: String, trim: true, default: '' },

    // Điều kiện tiên quyết trước khi thực hiện test
    preconditions: {
      type: String,
      default: '',
      // VD: "User đã đăng nhập, đang ở trang Dashboard"
    },
    postconditions: { type: String, default: '' },
    environmentRequirement: { type: String, default: '' },
    productRisks: { type: [String], default: [] },
    assumptions: { type: [String], default: [] },
    evidence: { type: [{ sourceType: String, sourceId: String, title: String, version: String, excerpt: String }], default: [] },
    automationCandidate: {
      eligible: { type: Boolean, default: false },
      reason: { type: String, default: '' },
    },
    generationContext: {
      scopeMode: { type: String, enum: ['single', 'feature', 'uncovered'], default: 'single' },
      polarity: { type: String, enum: ['positive', 'negative', 'both'], default: 'both' },
      detailLevel: { type: String, enum: ['Scenario', 'Standard', 'Detailed'], default: 'Standard' },
      techniques: { type: [String], default: [] },
      includeSecurity: { type: Boolean, default: false },
      includeAccessibility: { type: Boolean, default: false },
      generationMode: { type: String, enum: ['logic', 'technicalContext', 'executionReady'], default: 'logic' },
      readinessStatus: { type: String, enum: ['Ready', 'Assumptions', 'Blocked'], default: 'Assumptions' },
      missingInputs: { type: [String], default: [] },
      unavailableTestTypes: { type: [String], default: [] },
      assumptions: { type: [String], default: [] },
      planSnapshot: { type: Schema.Types.Mixed, default: null },
      references: { type: [Schema.Types.Mixed], default: [] },
      environmentContext: { type: Schema.Types.Mixed, default: null },
      // Legacy fields retained only to read records created before environment
      // selection was moved out of Test Case design and into execution.
      environmentProfile: { type: Schema.Types.ObjectId, ref: 'TestEnvironment', default: null },
      environmentSnapshot: { type: Schema.Types.Mixed, default: null },
    },
    testDesignTechniques: { type: [String], default: [] },

    priority: {
      type: String,
      enum: {
        values: ['Critical', 'High', 'Medium', 'Low'],
        message: 'Độ ưu tiên phải là: Critical, High, Medium, hoặc Low',
      },
      default: 'Medium',
    },

    type: {
      type: String,
      enum: {
        values: ['Manual', 'Automated'],
        message: 'Loại test phải là: Manual hoặc Automated',
      },
      default: 'Manual',
    },
    quarantined: { type: Boolean, default: false },
    retryLimit: { type: Number, min: 0, max: 3, default: 0 },

    status: {
      type: String,
      enum: {
        values: ['Draft', 'NeedsReview', 'Approved', 'Rejected', 'Active', 'Deprecated'],
        message: 'Trạng thái phải là: Draft, NeedsReview, Approved, Rejected, Active, hoặc Deprecated',
      },
      default: 'Draft',
    },
    approvalException: {
      mode: { type: String, enum: ['Standard', 'OwnerFallback', 'SelfApproval'], default: 'Standard' },
      reason: { type: String, default: '' },
      responsibility: { type: String, enum: ['Business', 'QA'], default: 'QA' },
      recordedAt: { type: Date, default: null },
    },

    // Thời gian ước tính (phút)
    estimatedTime: {
      type: Number,
      default: 0,
      min: [0, 'Thời gian không được âm'],
    },

    // -------------------------------------------
    // Embedded: Test Steps (Các bước kiểm thử)
    // -------------------------------------------
    testSteps: [testStepSchema],

    // Tags để phân loại
    tags: {
      type: [String],
      default: [],
    },

    // Dữ liệu traceability khi AI kết hợp User Story với website thật.
    targetUrl: { type: String, default: null },
    generatedFrom: {
      type: String,
      enum: ['Manual', 'Requirement', 'UseCase', 'UserStory', 'UserStoryAndWeb', 'SystemE2E'],
      default: 'Manual',
    },
    // Project-derived grouping and many-to-many traceability. These values
    // stay on each Test Case record; Excel sheets are only a presentation of
    // this data and are never persisted as fixed project structure.
    module: { type: String, trim: true, maxlength: 300, default: '' },
    feature: { type: String, trim: true, maxlength: 300, default: '' },
    primaryTestBasis: {
      basisType: { type: String, enum: ['Requirement', 'UserStory', 'UseCase', 'Manual'], default: 'Manual' },
      basisId: { type: Schema.Types.ObjectId, default: null },
      code: { type: String, trim: true, maxlength: 160, default: '' },
      title: { type: String, trim: true, maxlength: 500, default: '' },
    },
    linkedRequirements: [{ type: Schema.Types.ObjectId, ref: 'Requirement' }],
    linkedUserStories: [{ type: Schema.Types.ObjectId, ref: 'UserStory' }],
    linkedUseCases: [{ type: Schema.Types.ObjectId, ref: 'UseCase' }],
    coverageItems: { type: [String], default: [] },
    storyCoverage: { type: [String], default: [] },
    generatedTestData: { type: Schema.Types.Mixed, default: {} },
    webAnalysisSnapshot: {
      analysisId: { type: String, default: null },
      analyzedAt: { type: Date, default: null },
      finalUrl: { type: String, default: null },
      screenshotUrl: { type: String, default: null },
      pageTitle: { type: String, default: null },
      counts: { type: Schema.Types.Mixed, default: {} },
    },
    e2e: {
      testPlan: { type: Schema.Types.ObjectId, ref: 'TestPlan', default: null },
      systemProfile: { type: Schema.Types.ObjectId, ref: 'SystemProfile', default: null },
      useCase: { type: Schema.Types.ObjectId, ref: 'UseCase', default: null },
      requirements: [{ type: Schema.Types.ObjectId, ref: 'Requirement' }],
      journeyType: { type: String, default: '' },
      routeCoverage: { type: [String], default: [] },
      setup: { type: [String], default: [] },
      cleanup: { type: [String], default: [] },
    },

    // -------------------------------------------
    // Liên kết (References)
    // -------------------------------------------
    testSuite: {
      type: Schema.Types.ObjectId,
      ref: 'TestSuite',
      required: [true, 'Test Suite là bắt buộc'],
    },

    userStory: {
      type: Schema.Types.ObjectId,
      ref: 'UserStory',
      default: null, // Liên kết tới yêu cầu nghiệp vụ (traceability)
    },

    // Dữ liệu test dùng chung
    sharedTestData: [
      {
        type: Schema.Types.ObjectId,
        ref: 'SharedTestData',
      },
    ],

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'test_cases',
  }
);

// =============================================
// Indexes
// =============================================
testCaseSchema.index({ testSuite: 1, status: 1 });
testCaseSchema.index({ userStory: 1 });
testCaseSchema.index({ priority: 1, type: 1 });
testCaseSchema.index({ tags: 1 });
testCaseSchema.index({ createdBy: 1 });
testCaseSchema.index({ generatedFrom: 1, 'webAnalysisSnapshot.analysisId': 1 });
testCaseSchema.index({ 'e2e.testPlan': 1, module: 1, feature: 1 });
testCaseSchema.index({ linkedRequirements: 1 });
testCaseSchema.index({ linkedUserStories: 1 });
testCaseSchema.index({ linkedUseCases: 1 });

module.exports = mongoose.model('TestCase', testCaseSchema);
