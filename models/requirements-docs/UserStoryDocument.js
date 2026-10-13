const mongoose = require('mongoose');

const userStoryDocumentSchema = new mongoose.Schema({
  userStory: { type: mongoose.Schema.Types.ObjectId, ref: 'UserStory', required: true },
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  originalName: { type: String, required: true, trim: true, maxlength: 260 },
  storedName: { type: String, required: true },
  storagePath: { type: String, required: true, select: false },
  mimeType: { type: String, required: true },
  extension: { type: String, enum: ['.pdf', '.doc', '.docx'], required: true },
  size: { type: Number, required: true, min: 1, max: 10 * 1024 * 1024 },
  sha256: { type: String, required: true, minlength: 64, maxlength: 64 },
  status: { type: String, enum: ['Uploaded', 'Processing', 'Ready', 'Failed'], default: 'Uploaded' },
  extractedText: { type: String, default: '', select: false },
  textLength: { type: Number, default: 0 },
  pageCount: { type: Number, default: null },
  extractionMethod: { type: String, enum: ['pdf-parse', 'mammoth', 'word-extractor'], required: true },
  extractionWarnings: { type: [String], default: [] },
  errorMessage: { type: String, default: null },
  wasTruncated: { type: Boolean, default: false },
  processedAt: { type: Date, default: null },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, collection: 'user_story_documents' });

userStoryDocumentSchema.index({ userStory: 1, createdAt: -1 });
userStoryDocumentSchema.index({ project: 1, status: 1 });
userStoryDocumentSchema.index({ userStory: 1, sha256: 1 }, { unique: true });

module.exports = mongoose.model('UserStoryDocument', userStoryDocumentSchema);
