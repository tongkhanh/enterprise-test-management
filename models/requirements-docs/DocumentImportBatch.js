const mongoose = require('mongoose');
const { Schema } = mongoose;

const schema = new Schema({
  project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  systemProfile: { type: Schema.Types.ObjectId, ref: 'SystemProfile', required: true, index: true },
  artifactType: { type: String, enum: ['Requirement', 'UseCase'], required: true, index: true },
  fileName: { type: String, required: true, trim: true, maxlength: 255 },
  fileHash: { type: String, required: true, index: true },
  detectedType: { type: String, default: '' },
  status: { type: String, enum: ['Completed', 'RolledBack', 'Retired'], default: 'Completed', index: true },
  createdArtifactIds: { type: [Schema.Types.ObjectId], default: [] },
  updatedArtifacts: { type: [{ artifactId: Schema.Types.ObjectId, before: Schema.Types.Mixed }], default: [] },
  artifactCount: { type: Number, default: 0 },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  rolledBackBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  rolledBackAt: { type: Date, default: null },
  rollbackMode: { type: String, enum: ['', 'Deleted', 'Retired'], default: '' },
}, { timestamps: true, collection: 'document_import_batches' });

schema.index({ systemProfile: 1, artifactType: 1, createdAt: -1 });
module.exports = mongoose.model('DocumentImportBatch', schema);
