const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  automationResult: { type: mongoose.Schema.Types.ObjectId, ref: 'AutomationResult', default: null, index: true },
  environmentBuild: { type: mongoose.Schema.Types.ObjectId, ref: 'EnvironmentBuild', default: null, index: true },
  source: { type: String, enum: ['Playwright', 'Selenium', 'Cypress', 'WebdriverIO', 'RobotFramework', 'Docker', 'Application', 'Database', 'CI'], required: true },
  artifactType: { type: String, enum: ['Screenshot', 'Trace', 'Video', 'Log', 'DOM', 'Report', 'Network', 'Health', 'Other'], required: true },
  name: { type: String, required: true }, mimeType: { type: String, default: 'application/octet-stream' },
  uri: { type: String, required: true }, checksum: { type: String, default: '' }, size: { type: Number, default: 0 },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }, capturedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: null },
}, { timestamps: true, collection: 'execution_artifacts' });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, partialFilterExpression: { expiresAt: { $type: 'date' } } });
module.exports = mongoose.model('ExecutionArtifact', schema);
