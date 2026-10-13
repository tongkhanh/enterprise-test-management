const mongoose = require('mongoose');

const projectActivitySchema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action: { type: String, enum: ['CREATED', 'UPDATED', 'DELETED', 'STATUS_CHANGED', 'UPLOADED', 'PROCESSED'], required: true },
  entityType: { type: String, enum: ['Project', 'Cycle', 'Label', 'UserStory', 'Document', 'TestCase', 'BoardItem', 'TestPlan', 'TestRun'], required: true },
  entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
  title: { type: String, required: true, maxlength: 300 },
  description: { type: String, default: '', maxlength: 1000 },
  changes: { type: mongoose.Schema.Types.Mixed, default: null },
}, { timestamps: true, collection: 'project_activities' });

projectActivitySchema.index({ project: 1, createdAt: -1 });
projectActivitySchema.index({ entityType: 1, entityId: 1 });

module.exports = mongoose.model('ProjectActivity', projectActivitySchema);
