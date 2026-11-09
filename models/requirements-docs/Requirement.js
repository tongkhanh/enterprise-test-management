const mongoose = require('mongoose');
const { Schema } = mongoose;

// A customer requirement is the authoritative test basis. Repository analysis
// may add technical evidence later, but must never replace this record.
const requirementSchema = new Schema({
  project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  systemProfile: { type: Schema.Types.ObjectId, ref: 'SystemProfile', required: true, index: true },
  requirementId: { type: String, trim: true, maxlength: 80, default: '' },
  title: { type: String, required: true, trim: true, maxlength: 300 },
  type: { type: String, enum: ['Functional', 'NonFunctional', 'BusinessRule', 'Integration'], default: 'Functional' },
  priority: { type: String, enum: ['Critical', 'High', 'Medium', 'Low'], default: 'Medium' },
  release: { type: String, trim: true, maxlength: 120, default: '' },
  description: { type: String, required: true, trim: true, maxlength: 8000 },
  objective: { type: String, trim: true, maxlength: 3000, default: '' },
  actors: { type: [String], default: [] },
  inScope: { type: [String], default: [] },
  outOfScope: { type: [String], default: [] },
  businessRules: { type: [String], default: [] },
  acceptanceCriteria: { type: [String], default: [] },
  nonFunctionalRequirements: { type: [String], default: [] },
  risks: { type: [String], default: [] },
  assumptions: { type: [String], default: [] },
  dependencies: { type: [String], default: [] },
  testDataRequirements: { type: [String], default: [] },
  dataRestrictions: { type: [String], default: [] },
  scope: {
    level: { type: String, enum: ['System', 'Module', 'Feature', 'Flow'], default: 'Feature' },
    name: { type: String, trim: true, maxlength: 300, default: '' },
  },
  source: {
    type: { type: String, enum: ['ManualCustomerBrief', 'CustomerDocument'], required: true },
    title: { type: String, required: true, trim: true, maxlength: 300 },
    provider: { type: String, required: true, trim: true, maxlength: 300 },
    receivedAt: { type: Date, required: true },
    version: { type: String, trim: true, maxlength: 120, default: '' },
    reference: { type: String, trim: true, maxlength: 1000, default: '' },
    section: { type: String, trim: true, maxlength: 500, default: '' },
    fileName: { type: String, trim: true, maxlength: 255, default: '' },
    extractionMethod: { type: String, trim: true, maxlength: 120, default: '' },
  },
  attachments: { type: [{ name: String, storagePath: String, mimeType: String, size: Number, uploadedAt: Date }], default: [] },
  technicalEvidence: { type: [{ repository: String, commitSha: String, paths: [String], note: String }], default: [] },
  status: { type: String, enum: ['Draft', 'Reviewed', 'Baselined', 'Rejected', 'Changed', 'Retired'], default: 'Draft', index: true },
  reviewNote: { type: String, trim: true, maxlength: 2000, default: '' },
  baselinedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  baselinedAt: { type: Date, default: null },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, collection: 'requirements' });

requirementSchema.index({ project: 1, systemProfile: 1, status: 1 });
requirementSchema.index({ project: 1, requirementId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Requirement', requirementSchema);
