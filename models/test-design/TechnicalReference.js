const mongoose = require('mongoose');
const { Schema } = mongoose;

const technicalReferenceSchema = new Schema({
  project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  systemProfile: { type: Schema.Types.ObjectId, ref: 'SystemProfile', default: null, index: true },
  type: { type: String, required: true, trim: true, maxlength: 80 },
  title: { type: String, required: true, trim: true, maxlength: 300 },
  version: { type: String, trim: true, maxlength: 100, default: '' },
  sourceMode: { type: String, enum: ['File', 'URL'], required: true },
  url: { type: String, maxlength: 2000, default: '' },
  originalFilename: { type: String, maxlength: 500, default: '' },
  mimeType: { type: String, maxlength: 200, default: '' },
  size: { type: Number, min: 0, default: 0 },
  checksum: { type: String, maxlength: 128, default: '' },
  storagePath: { type: String, maxlength: 2000, default: '' },
  extractionMethod: { type: String, maxlength: 100, default: '' },
  contentExcerpt: { type: String, maxlength: 20000, default: '' },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

technicalReferenceSchema.index({ project: 1, type: 1, createdAt: -1 });

module.exports = mongoose.models.TechnicalReference || mongoose.model('TechnicalReference', technicalReferenceSchema);
