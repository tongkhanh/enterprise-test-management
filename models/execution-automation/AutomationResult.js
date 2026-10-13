const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Kết quả CI/CD hoặc job Playwright nội bộ. Model này đồng thời đóng vai trò
 * hàng đợi bền vững để trạng thái Queued/Running vẫn hiển thị trên giao diện.
 */
const automationResultSchema = new Schema(
  {
    suiteName: { type: String, required: true, trim: true },
    framework: {
      type: String,
      enum: ['Selenium', 'Cypress', 'Playwright', 'WebdriverIO', 'Jest', 'Mocha', 'Robot', 'Other'],
      required: true,
    },
    status: {
      type: String,
      enum: ['Queued', 'Running', 'Passed', 'Failed', 'Error', 'Cancelled'],
      required: true,
    },
    duration: { type: Number, default: 0, min: 0 },
    totalTests: { type: Number, default: 0, min: 0 },
    passed: { type: Number, default: 0, min: 0 },
    failed: { type: Number, default: 0, min: 0 },
    skipped: { type: Number, default: 0, min: 0 },
    buildNumber: { type: String, default: null },
    pipelineUrl: { type: String, default: null },
    triggeredBy: {
      type: String,
      enum: ['CI_CD', 'Manual', 'Webhook', 'Scheduled'],
      default: 'CI_CD',
    },
    payload: { type: Schema.Types.Mixed, default: null },
    errorLogs: { type: String, default: null },

    // Job progress và bằng chứng Playwright.
    progress: { type: Number, default: 0, min: 0, max: 100 },
    currentStep: { type: Number, default: 0, min: 0 },
    totalSteps: { type: Number, default: 0, min: 0 },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    targetUrl: { type: String, default: null },
    testEnvironment: { type: mongoose.Schema.Types.ObjectId, ref: 'TestEnvironment', default: null },
    browserName: { type: String, default: 'chromium' },
    viewport: {
      width: { type: Number, default: 1440 },
      height: { type: Number, default: 900 },
    },
    stepResults: { type: [Schema.Types.Mixed], default: [] },
    diagnostics: {
      consoleMessages: { type: [Schema.Types.Mixed], default: [] },
      pageErrors: { type: [Schema.Types.Mixed], default: [] },
      failedRequests: { type: [Schema.Types.Mixed], default: [] },
      httpErrors: { type: [Schema.Types.Mixed], default: [] },
      finalUrl: { type: String, default: null },
      domSnippet: { type: String, default: null },
    },
    artifacts: { type: Schema.Types.Mixed, default: {} },
    failureAnalysis: { type: Schema.Types.Mixed, default: null },
    triage: { type: Schema.Types.Mixed, default: null },

    // Có thể chứa test data nhạy cảm nên không bao giờ trả về trong query mặc định.
    runtimeConfig: { type: Schema.Types.Mixed, default: {}, select: false },

    testRun: { type: Schema.Types.ObjectId, ref: 'TestRun', default: null },
    testPlan: { type: Schema.Types.ObjectId, ref: 'TestPlan', default: null },
    testExecution: { type: Schema.Types.ObjectId, ref: 'TestExecution', default: null },
    testCase: { type: Schema.Types.ObjectId, ref: 'TestCase', default: null },
    userStory: { type: Schema.Types.ObjectId, ref: 'UserStory', default: null },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
  },
  { timestamps: true, collection: 'automation_results' }
);

automationResultSchema.index({ project: 1, createdAt: -1 });
automationResultSchema.index({ testRun: 1 });
automationResultSchema.index({ framework: 1, status: 1 });
automationResultSchema.index({ buildNumber: 1 });
automationResultSchema.index({ requestedBy: 1, status: 1, createdAt: -1 });
automationResultSchema.index({ testCase: 1, createdAt: -1 });

module.exports = mongoose.model('AutomationResult', automationResultSchema);
