const mongoose = require('mongoose');

const teamSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  key: { type: String, required: true, trim: true, uppercase: true, maxlength: 12, match: /^[A-Z0-9]+$/ },
  description: { type: String, trim: true, default: '' },
  color: { type: String, default: '#5B4EF2' },
  icon: { type: String, default: 'flask-conical' },
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  // Legacy single-project link is retained for old records; new teams are workspace-level.
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },
  projects: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Project' }],
  lead: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  isArchived: { type: Boolean, default: false },
  isPrivate: { type: Boolean, default: false },
  cycleSettings: { durationWeeks: { type: Number, min: 1, max: 8, default: 2 }, startDay: { type: Number, min: 0, max: 6, default: 1 }, enabled: { type: Boolean, default: true } },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, collection: 'teams' });

teamSchema.index({ workspace: 1, key: 1 }, { unique: true });
teamSchema.index({ workspace: 1, isArchived: 1 });
teamSchema.index({ members: 1 });

module.exports = mongoose.model('Team', teamSchema);
