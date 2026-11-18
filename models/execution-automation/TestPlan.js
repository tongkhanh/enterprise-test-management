/**
 * ============================================================
 * MODEL: TestPlan (Kế hoạch kiểm thử)
 * Phân hệ: Thực thi & Tích hợp Tự động (Execution & Automation)
 * Collection: test_plans
 * ============================================================
 * Kế hoạch kiểm thử: Phạm vi test, Người phụ trách,
 * Thuộc Release nào, danh sách Test Cases cần chạy.
 * ============================================================
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const testPlanSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Tên Test Plan là bắt buộc'],
      trim: true,
      maxlength: [300, 'Tên Test Plan không được quá 300 ký tự'],
    },

    description: {
      type: String,
      trim: true,
      default: '',
    },

    // Phạm vi kiểm thử
    scope: {
      type: String,
      default: '',
      // VD: "Test toàn bộ chức năng Đăng nhập, Đăng ký, và Quên mật khẩu"
    },
    planId: { type: String, trim: true, default: '' },
    // Phân biệt kế hoạch kiểm thử trước khi thiết kế case và kế hoạch thực thi sau khi case đã được duyệt.
    kind: {
      type: String,
      enum: ['TestPlan', 'ExecutionPlan'],
      default: 'TestPlan',
      index: true,
    },
    // Master = toàn Project/Release; Feature = một module/epic hoặc nhóm User
    // Story liên quan; CycleExecution = tập Test Case thực thi trong một Cycle.
    // Giữ trường này độc lập với `kind` để phân biệt tài liệu chiến lược và kế
    // hoạch chạy, thay vì gọi chung tất cả là Test Plan.
    planLevel: {
      type: String,
      enum: ['Master', 'Feature', 'CycleExecution'],
      default: 'Feature',
      index: true,
    },
    // Ghi tại thời điểm tạo để truy vết nguồn tài liệu, không suy đoán ở UI.
    origin: {
      type: String,
      enum: ['Manual', 'AI', 'Rule', 'Board', 'ImportedDocument'],
      default: null,
      index: true,
    },
    systemProfile: { type: Schema.Types.ObjectId, ref: 'SystemProfile', default: null, index: true },
    importSource: {
      sourceType: { type: String, enum: ['Upload', 'Library'], default: undefined },
      fileName: { type: String, trim: true, maxlength: 255, default: '' },
      extractionMethod: { type: String, trim: true, maxlength: 100, default: '' },
      textLength: { type: Number, min: 0, default: 0 },
      sourcePlan: { type: Schema.Types.ObjectId, ref: 'TestPlan', default: null },
    },
    // Test Plan may be based on any approved test-basis artifact. User Story
    // is common in Agile projects, but it is not mandatory when the customer
    // supplied baselined Requirements or approved Use Cases directly.
    requirements: [{ type: Schema.Types.ObjectId, ref: 'Requirement' }],
    userStories: [{ type: Schema.Types.ObjectId, ref: 'UserStory' }],
    useCases: [{ type: Schema.Types.ObjectId, ref: 'UseCase' }],
    objectives: { type: [String], default: [] },
    testStrategy: { type: String, default: '' },
    testData: { type: String, default: '' },
    testItems: { type: [String], default: [] },
    outOfScope: { type: [String], default: [] },
    entryCriteria: { type: [String], default: [] },
    exitCriteria: { type: [String], default: [] },
    risks: { type: [{ risk: String, mitigation: String, owner: String }], default: [] },
    deliverables: { type: [String], default: [] },
    testTypes: { type: [String], default: [] },
    testLevels: { type: [String], default: [] },
    coverageTargets: { type: [String], default: [] },
    environmentRequirements: { type: String, default: '' },
    documentControl: {
      documentId: { type: String, default: '' }, documentTitle: { type: String, default: '' },
      version: { type: String, default: '' }, author: { type: String, default: '' }, reviewer: { type: String, default: '' },
      documentStatus: { type: String, default: 'Draft' }, documentDate: { type: Date, default: null },
      versionHistory: { type: [{ version: String, date: String, author: String, description: String }], default: [] },
    },
    introduction: { purpose: { type: String, default: '' }, background: { type: String, default: '' } },
    systemUnderTest: { name: { type: String, default: '' }, targetUrl: { type: String, default: '' }, primaryModules: { type: [String], default: [] } },
    testItemMatrix: { type: [{ itemId: String, module: String, description: String }], default: [] },
    methodologies: { type: [String], default: [] },
    testTypeMatrix: { type: [{ testType: String, purpose: String }], default: [] },
    environmentSpecifications: { type: [{ category: String, specification: String }], default: [] },
    testDataRequirements: { type: [String], default: [] },
    milestones: { type: [{ phase: String, activity: String, timeframe: String }], default: [] },
    passFailCriteria: { testCasePass: { type: String, default: '' }, testCaseFail: { type: String, default: '' }, testCycleCompletion: { type: String, default: '' } },
    defectManagement: {
      workflow: { type: [String], default: [] },
      severityDefinitions: { type: [{ level: String, definition: String }], default: [] },
      priorityDefinitions: { type: [{ level: String, definition: String }], default: [] },
    },
    rolesResponsibilities: { type: [{ role: String, responsibilities: [String] }], default: [] },
    riskMatrix: { type: [{ risk: String, impact: String, mitigation: String, owner: String }], default: [] },
    assumptions: { type: [String], default: [] },
    dependencies: { type: [String], default: [] },
    traceabilityMatrix: { type: [{ feature: String, basisReference: String, testType: String, coverageStatus: String, notes: String }], default: [] },
    signOff: { type: [{ role: String, name: String, date: String, status: String }], default: [] },
    planningContext: {
      releaseOrSprint: { type: String, default: '' },
      moduleOrFeatures: { type: [String], default: [] },
      changeType: { type: String, default: '' },
      releaseGoal: { type: String, default: '' },
      deadline: { type: Date, default: null },
      systemLifecycle: { type: String, enum: ['', 'New', 'Existing'], default: '' },
      scheduleRequired: { type: Boolean, default: false },
    },
    planningConstraints: {
      criticalFunctions: { type: [String], default: [] },
      impact: { type: String, default: '' },
      likelihood: { type: String, default: '' },
      defectProneAreas: { type: [String], default: [] },
      compliance: { type: [String], default: [] },
      nfrOrSla: { type: [String], default: [] },
      timeConstraint: { type: String, default: '' },
      qaCount: { type: Number, min: 0, default: null },
      tools: { type: [String], default: [] },
      unavailableDependencies: { type: [String], default: [] },
      dataEnvironmentLimits: { type: [String], default: [] },
    },
    estimatedEffortHours: { type: Number, min: 0, default: 0 },

    status: {
      type: String,
      enum: {
        values: ['Draft', 'Active', 'Completed', 'Archived'],
        message: 'Trạng thái phải là: Draft, Active, Completed, hoặc Archived',
      },
      default: 'Draft',
    },
    approvalStatus: {
      type: String,
      enum: ['Draft', 'PendingApproval', 'Approved', 'Rejected'],
      default: 'Draft',
      index: true,
    },
    aiSuggestion: { type: Schema.Types.Mixed, default: null },
    reviewNote: { type: String, default: '' },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
    approvalException: {
      mode: { type: String, enum: ['Standard', 'RoleFallback', 'OwnerFallback', 'SelfApproval'], default: 'Standard' },
      reason: { type: String, default: '' }, responsibility: { type: String, enum: ['Business', 'QA'], default: 'QA' }, recordedAt: { type: Date, default: null },
    },

    startDate: {
      type: Date,
      default: null,
    },

    endDate: {
      type: Date,
      default: null,
    },

    // Môi trường test
    environment: {
      type: String,
      default: '',
      // VD: "Staging - Ubuntu 22.04 - Chrome 120"
    },

    // -------------------------------------------
    // Liên kết (References)
    // -------------------------------------------
    project: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: [true, 'Dự án là bắt buộc'],
    },

    cycle: {
      type: Schema.Types.ObjectId,
      ref: 'Sprint',
      default: null,
    },

    boardItems: [{ type: Schema.Types.ObjectId, ref: 'BoardItem' }],

    release: {
      type: Schema.Types.ObjectId,
      ref: 'Release',
      default: null,
    },

    assignee: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null, // Người phụ trách chính
    },

    testCases: [
      {
        type: Schema.Types.ObjectId,
        ref: 'TestCase',
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
    collection: 'test_plans',
  }
);

// =============================================
// Indexes
// =============================================
testPlanSchema.index({ project: 1, status: 1 });
testPlanSchema.index({ release: 1 });
testPlanSchema.index({ assignee: 1 });
testPlanSchema.index({ cycle: 1, status: 1 });

module.exports = mongoose.model('TestPlan', testPlanSchema);
