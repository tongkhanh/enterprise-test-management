const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  kind: { type: String, enum: ['StaticUrl', 'DockerGitHub'], default: 'StaticUrl' },
  status: { type: String, enum: ['Draft', 'Provisioning', 'Ready', 'Failed', 'Stopped'], default: 'Draft', index: true },
  targetUrl: { type: String, trim: true, default: '' },
  integration: { type: mongoose.Schema.Types.ObjectId, ref: 'IntegrationConnection', default: null },
  repository: {
    fullName: { type: String, trim: true, default: '' },
    cloneUrl: { type: String, trim: true, default: '' },
    ref: { type: String, trim: true, default: 'main' },
    commitSha: { type: String, trim: true, default: '' },
    pullRequestNumber: { type: Number, default: null },
  },
  docker: {
    dockerfile: { type: String, trim: true, default: 'Dockerfile' },
    context: { type: String, trim: true, default: '.' },
    containerPort: { type: Number, default: 3000, min: 1, max: 65535 },
    hostPort: { type: Number, default: null },
    imageTag: { type: String, default: '' },
    containerId: { type: String, default: '' },
    networkName: { type: String, default: '' },
  },
  healthCheckPath: { type: String, default: '/' },
  healthCheckTimeoutMs: { type: Number, default: 90000 },
  healthCheckStatus: { type: String, enum: ['Unknown', 'Healthy', 'Unhealthy'], default: 'Unknown' },
  lastHealthCheckAt: { type: Date, default: null },
  expiresAt: { type: Date, default: null },
  autoBuildOnPush: { type: Boolean, default: true },
  autoBuildOnPullRequest: { type: Boolean, default: true },
  autoRetest: { type: Boolean, default: false },
  autoAnalyze: { type: Boolean, default: true },
  latestWebAnalysis: { type: mongoose.Schema.Types.Mixed, default: null },
  buildLog: { type: String, default: '', maxlength: 200000 },
  lastError: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  readyAt: { type: Date, default: null },
}, { timestamps: true, collection: 'test_environments' });

schema.index({ project: 1, name: 1 }, { unique: true });
module.exports = mongoose.model('TestEnvironment', schema);
