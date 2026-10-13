const mongoose = require('mongoose');

const integrationSyncLogSchema = new mongoose.Schema({
  integration: { type: mongoose.Schema.Types.ObjectId, ref: 'IntegrationConnection', required: true },
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },
  provider: { type: String, enum: ['Jira', 'GitHub', 'Linear'], required: true },
  direction: { type: String, enum: ['Inbound', 'Outbound', 'System'], default: 'System' },
  action: { type: String, required: true, trim: true },
  status: { type: String, enum: ['Pending', 'Success', 'Failed', 'Retrying'], default: 'Pending' },
  attempt: { type: Number, default: 1, min: 1 },
  durationMs: { type: Number, default: 0, min: 0 },
  externalEntity: {
    type: { type: String, default: '' },
    id: { type: String, default: '' },
    key: { type: String, default: '' },
    url: { type: String, default: '' },
  },
  payloadHash: { type: String, default: '' },
  message: { type: String, default: '' },
  error: { type: String, default: '' },
  initiatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, collection: 'integration_sync_logs' });

integrationSyncLogSchema.index({ integration: 1, createdAt: -1 });
integrationSyncLogSchema.index({ project: 1, provider: 1, status: 1 });

module.exports = mongoose.model('IntegrationSyncLog', integrationSyncLogSchema);
