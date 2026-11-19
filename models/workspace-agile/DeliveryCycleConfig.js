const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },
  enabled: { type: Boolean, default: true },
  durationWeeks: { type: Number, min: 1, max: 8, default: 2 },
  cooldownDays: { type: Number, min: 0, max: 14, default: 0 },
  futureCount: { type: Number, min: 1, max: 12, default: 3 },
  anchorDate: { type: Date, required: true },
  rolloverOpenIssues: { type: Boolean, default: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, collection: 'delivery_cycle_configs' });

schema.index({ project: 1, team: 1 }, { unique: true });
module.exports = mongoose.model('DeliveryCycleConfig', schema);
