const mongoose = require('mongoose');
const { WORKSPACE_ROLE_NAMES } = require('../../config/roles');

const workspaceMembershipSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: WORKSPACE_ROLE_NAMES, required: true, default: 'Guest' },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  joinedAt: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true },
}, { timestamps: true, collection: 'workspace_memberships' });

workspaceMembershipSchema.index({ workspace: 1, user: 1 }, { unique: true });
workspaceMembershipSchema.index({ user: 1, isActive: 1 });
workspaceMembershipSchema.index({ workspace: 1, role: 1 });

module.exports = mongoose.model('WorkspaceMembership', workspaceMembershipSchema);
