const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  environment: { type: mongoose.Schema.Types.ObjectId, ref: 'TestEnvironment', required: true, index: true },
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  source: { type: String, enum: ['Manual', 'Push', 'PullRequest', 'Scheduled'], default: 'Manual' },
  ref: { type: String, default: '' }, commitSha: { type: String, default: '' }, pullRequestNumber: { type: Number, default: null },
  status: { type: String, enum: ['Queued', 'Cloning', 'Building', 'Starting', 'HealthChecking', 'Ready', 'Failed', 'Cancelled'], default: 'Queued', index: true },
  progress: { type: Number, min: 0, max: 100, default: 0 }, jobId: { type: String, default: '' },
  imageTag: { type: String, default: '' }, containerId: { type: String, default: '' }, networkId: { type: String, default: '' },
  logs: { type: String, default: '', maxlength: 500000 }, error: { type: String, default: '' },
  startedAt: { type: Date, default: null }, completedAt: { type: Date, default: null }, durationMs: { type: Number, default: 0 },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, collection: 'environment_builds' });
schema.index({ environment: 1, createdAt: -1 });
module.exports = mongoose.model('EnvironmentBuild', schema);
