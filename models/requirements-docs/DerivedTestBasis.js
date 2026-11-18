const mongoose = require('mongoose');

const { Schema } = mongoose;

const derivedTestBasisSchema = new Schema({
  project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  systemProfile: { type: Schema.Types.ObjectId, ref: 'SystemProfile', default: null, index: true },
  targetType: { type: String, enum: ['Requirement', 'UseCase', 'UserStory'], required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 300 },
  content: { type: Schema.Types.Mixed, required: true },
  origin: { type: String, enum: ['AIDerived'], default: 'AIDerived', immutable: true, index: true },
  authority: { type: String, enum: ['Candidate', 'Supporting'], default: 'Candidate', index: true },
  status: { type: String, enum: ['AIDraft', 'Edited', 'AcceptedForTesting', 'Superseded', 'Archived'], default: 'AIDraft', index: true },
  sourceArtifacts: [{
    artifactType: { type: String, enum: ['Requirement', 'UseCase', 'UserStory'], required: true },
    artifactId: { type: Schema.Types.ObjectId, required: true },
    title: { type: String, required: true },
    statusAtGeneration: { type: String, required: true },
  }],
  generationNote: { type: String, default: '', maxlength: 3000 },
  reviewNote: { type: String, default: '', maxlength: 3000 },
  acceptedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  acceptedAt: { type: Date, default: null },
  adoptedSource: {
    artifactType: { type: String, enum: ['Requirement', 'UseCase', 'UserStory'], default: null },
    artifactId: { type: Schema.Types.ObjectId, default: null },
    adoptedAt: { type: Date, default: null },
  },
  supersededBy: {
    artifactType: { type: String, enum: ['Requirement', 'UseCase', 'UserStory'], default: null },
    artifactId: { type: Schema.Types.ObjectId, default: null },
    supersededAt: { type: Date, default: null },
  },
  reconciliation: {
    officialArtifactId: { type: Schema.Types.ObjectId, default: null },
    comparedAt: { type: Date, default: null },
    summary: { type: Schema.Types.Mixed, default: null },
  },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, collection: 'derived_test_basis' });

derivedTestBasisSchema.index({ project: 1, systemProfile: 1, targetType: 1, status: 1 });

module.exports = mongoose.model('DerivedTestBasis', derivedTestBasisSchema);
