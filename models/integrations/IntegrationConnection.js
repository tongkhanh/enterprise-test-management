const mongoose = require('mongoose');

const integrationConnectionSchema = new mongoose.Schema({
  provider: { type: String, enum: ['Jira', 'GitHub', 'Linear'], required: true },
  displayName: { type: String, required: true, trim: true, maxlength: 120 },
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },
  baseUrl: { type: String, trim: true, default: '' },
  externalProjectKey: { type: String, trim: true, default: '' },
  status: { type: String, enum: ['Configured', 'Connected', 'Error', 'Disconnected'], default: 'Configured' },
  settings: { type: mongoose.Schema.Types.Mixed, default: {} },
  credentialCiphertext: { type: String, default: null, select: false },
  hasCredentials: { type: Boolean, default: false },
  webhookSecretCiphertext: { type: String, default: null, select: false },
  hasWebhookSecret: { type: Boolean, default: false },
  syncConfig: {
    direction: { type: String, enum: ['Inbound', 'Outbound', 'Bidirectional'], default: 'Bidirectional' },
    entities: { type: [String], default: ['Bug'] },
    statusMappings: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  retryPolicy: {
    maxAttempts: { type: Number, default: 3, min: 1, max: 10 },
    backoffMs: { type: Number, default: 1000, min: 100, max: 60000 },
  },
  lastTestedAt: { type: Date, default: null },
  lastSyncAt: { type: Date, default: null },
  lastError: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, collection: 'integration_connections' });

integrationConnectionSchema.index({ workspace: 1, provider: 1, project: 1 });
integrationConnectionSchema.index({ project: 1, status: 1 });

module.exports = mongoose.model('IntegrationConnection', integrationConnectionSchema);
