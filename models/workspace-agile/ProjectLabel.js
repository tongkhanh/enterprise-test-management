const mongoose = require('mongoose');

const projectLabelSchema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  name: { type: String, required: true, trim: true, maxlength: 60 },
  color: { type: String, default: '#6D5DFB', match: /^#[0-9A-F]{6}$/i },
  description: { type: String, default: '', trim: true, maxlength: 300 },
  isArchived: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, collection: 'project_labels' });

projectLabelSchema.index({ project: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
projectLabelSchema.index({ project: 1, isArchived: 1 });

module.exports = mongoose.model('ProjectLabel', projectLabelSchema);
