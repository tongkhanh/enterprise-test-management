const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  integration: { type: mongoose.Schema.Types.ObjectId, ref: 'IntegrationConnection', required: true }, provider: { type: String, enum: ['GitHub', 'Jira'], required: true },
  deliveryId: { type: String, required: true }, event: { type: String, required: true }, payloadHash: { type: String, required: true },
  status: { type: String, enum: ['Accepted', 'Processing', 'Processed', 'Ignored', 'Failed'], default: 'Accepted' },
  error: { type: String, default: '' }, processedAt: { type: Date, default: null },
}, { timestamps: true, collection: 'webhook_deliveries' });
schema.index({ integration: 1, deliveryId: 1 }, { unique: true });
module.exports = mongoose.model('WebhookDelivery', schema);
