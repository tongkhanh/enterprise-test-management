const mongoose = require('mongoose');
const { Schema } = mongoose;

// Execution Profile: the durable boundary for a safe, repeatable test run.
// Business/test-basis artifacts belong to Project and only reference this
// profile when they need runtime context. Secrets remain references only.
const systemProfileSchema = new Schema({
  project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, default: '', maxlength: 8000 },
  referenceUrl: { type: String, default: '' },
  mode: { type: String, enum: ['SystemProfile', 'GitHubE2E'], required: true },
  environment: { type: Schema.Types.ObjectId, ref: 'TestEnvironment', default: null },
  baseUrl: { type: String, default: '' },
  allowedHosts: { type: [String], default: [] },
  roles: { type: [{ name: String, loginUrl: String, credentialSecretRef: String, startState: String }], default: [] },
  testData: { type: Schema.Types.Mixed, default: {} },
  hooks: { seedUrl: { type: String, default: '' }, cleanupUrl: { type: String, default: '' } },
  safetyPolicy: {
    allowCreateTestData: { type: Boolean, default: true },
    allowDeleteOnlyTaggedTestData: { type: Boolean, default: true },
    blockRealPayment: { type: Boolean, default: true },
    blockExternalEmail: { type: Boolean, default: true },
  },
  repository: {
    integrationId: { type: Schema.Types.ObjectId, ref: 'IntegrationConnection', default: null },
    fullName: { type: String, default: '' }, ref: { type: String, default: '' },
    commitSha: { type: String, default: '' }, pullRequestNumber: { type: Number, default: null },
    selectedPaths: { type: [String], default: [] },
  },
  repositorySnapshot: { type: Schema.Types.ObjectId, ref: 'RepositorySnapshot', default: null },
  systemMap: { type: Schema.Types.Mixed, default: {} },
  // Kept as a compatibility adapter for the current UI. It records navigation
  // and drafts; it is not the ownership boundary of Requirement/Use Case/etc.
  workflow: {
    runNumber: { type: Number, min: 1, default: 1 },
    status: { type: String, enum: ['Active', 'Paused', 'Completed'], default: 'Active', index: true },
    lastStep: { type: String, default: 'requirement' },
    startedAt: { type: Date, default: Date.now },
    lastActivityAt: { type: Date, default: Date.now },
    pausedAt: { type: Date, default: null },
    lastPausedStep: { type: String, default: '' },
    lastPausedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    // Bản nháp form dang dở theo từng bước. Chúng không được tính là
    // tài liệu cho tới khi người dùng bấm lưu/tạo artifact.
    drafts: { type: Schema.Types.Mixed, default: {} },
    // Quyết định ở bước 1. Chỉ các Test Basis nguồn đã được xác nhận mới
    // được chọn; tài liệu kỹ thuật và tài liệu AI dẫn xuất không thuộc đây.
    testBasisSelection: {
      requirements: [{ type: Schema.Types.ObjectId, ref: 'Requirement' }],
      useCases: [{ type: Schema.Types.ObjectId, ref: 'UseCase' }],
      userStories: [{ type: Schema.Types.ObjectId, ref: 'UserStory' }],
      scopeSummary: { type: String, default: '' },
      conflicts: { type: [{ description: String, resolution: String, severity: { type: String, enum: ['Low', 'Medium', 'High', 'Critical'], default: 'Medium' } }], default: [] },
      gaps: { type: [String], default: [] },
      confirmed: { type: Boolean, default: false },
      confirmedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      confirmedAt: { type: Date, default: null },
    },
    finalizations: { type: [Schema.Types.Mixed], default: [] },
  },
  status: { type: String, enum: ['Draft', 'Analyzing', 'Ready', 'Failed', 'Archived'], default: 'Draft' },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, collection: 'system_profiles' });
systemProfileSchema.index({ project: 1, mode: 1, status: 1 });
systemProfileSchema.index({ project: 1, 'workflow.runNumber': -1 });
module.exports = mongoose.model('SystemProfile', systemProfileSchema);
