const mongoose = require('mongoose');
const { PROJECT_ROLE_NAMES } = require('../../config/roles');

const projectMembershipSchema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: {
    type: String,
    enum: PROJECT_ROLE_NAMES,
    required: true,
    default: 'Guest',
  },
  teams: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team' }],
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  joinedAt: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true },
}, { timestamps: true, collection: 'project_memberships' });

projectMembershipSchema.index({ project: 1, user: 1 }, { unique: true });
projectMembershipSchema.index({ user: 1, isActive: 1 });
projectMembershipSchema.index({ project: 1, role: 1 });

module.exports = mongoose.model('ProjectMembership', projectMembershipSchema);
