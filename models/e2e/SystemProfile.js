const mongoose = require('mongoose');
const { Schema } = mongoose;

// The durable boundary for a safe, repeatable system-level test.  Secrets are
// intentionally references only; their values remain in EnvironmentSecret.
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
  systemMap: { type: Schema.Types.Mixed, default: {} },
  workflow: {
    runNumber: { type: Number, min: 1, default: 1 },
    status: { type: String, enum: ['Active', 'Paused', 'Completed'], default: 'Active', index: true },
    lastStep: { type: String, default: 'requirement' },
    startedAt: { type: Date, default: Date.now },
    lastActivityAt: { type: Date, default: Date.now },
    pausedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    // Bản nháp form dang dở theo từng bước. Chúng không được tính là
    // tài liệu cho tới khi người dùng bấm lưu/tạo artifact.
    drafts: { type: Schema.Types.Mixed, default: {} },
  },
  status: { type: String, enum: ['Draft', 'Analyzing', 'Ready', 'Failed', 'Archived'], default: 'Draft' },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, collection: 'system_profiles' });
systemProfileSchema.index({ project: 1, mode: 1, status: 1 });
systemProfileSchema.index({ project: 1, 'workflow.runNumber': -1 });
module.exports = mongoose.model('SystemProfile', systemProfileSchema);
