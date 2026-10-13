const mongoose = require('mongoose');
const { INVITABLE_WORKSPACE_ROLE_NAMES } = require('../../config/roles');

const workspaceInvitationSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true, match: /^\S+@\S+\.\S+$/ },
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  role: { type: String, enum: INVITABLE_WORKSPACE_ROLE_NAMES, required: true },
  tokenHash: { type: String, required: true, unique: true, select: false },
  status: { type: String, enum: ['Pending', 'Accepted', 'Expired', 'Cancelled'], default: 'Pending' },
  expiresAt: { type: Date, required: true },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  acceptedAt: { type: Date, default: null },
  emailDelivery: { type: String, enum: ['Pending', 'Sent', 'Skipped', 'Failed'], default: 'Pending' },
}, { timestamps: true, collection: 'workspace_invitations' });

workspaceInvitationSchema.index({ workspace: 1, email: 1, status: 1 });
workspaceInvitationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model('WorkspaceInvitation', workspaceInvitationSchema);
