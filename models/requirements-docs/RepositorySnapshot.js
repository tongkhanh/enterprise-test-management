const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  integration: { type: mongoose.Schema.Types.ObjectId, ref: 'IntegrationConnection', required: true },
  repository: { type: String, required: true, trim: true },
  ref: { type: String, required: true, trim: true },
  commitSha: { type: String, default: '' },
  pullRequestNumber: { type: Number, default: null },
  files: [{ path: String, sha: String, size: Number, excerpt: String }],
  combinedText: { type: String, default: '', maxlength: 500000, select: false },
  status: { type: String, enum: ['Ready', 'Failed'], default: 'Ready' },
  warning: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, collection: 'repository_snapshots' });

schema.index({ project: 1, repository: 1, commitSha: 1, createdAt: -1 });
module.exports = mongoose.model('RepositorySnapshot', schema);
