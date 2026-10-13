const mongoose = require('mongoose');
const { Schema } = mongoose;

const useCaseSchema = new Schema({
  project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  systemProfile: { type: Schema.Types.ObjectId, ref: 'SystemProfile', required: true, index: true },
  code: { type: String, trim: true, maxlength: 80 }, name: { type: String, required: true, trim: true, maxlength: 300 },
  actor: { type: String, required: true, trim: true },
  scope: { type: String, default: '', maxlength: 500 }, level: { type: String, default: 'User-goal', maxlength: 100 },
  stakeholders: { type: [String], default: [] }, specialRequirements: { type: [String], default: [] },
  summary: { type: String, default: '', maxlength: 3000 },
  trigger: { type: String, default: '', maxlength: 1000 },
  preconditions: { type: [String], default: [] }, mainFlow: { type: [String], default: [] },
  alternateFlows: { type: [String], default: [] }, exceptionFlows: { type: [String], default: [] },
  postconditions: { type: [String], default: [] }, risk: { type: String, enum: ['Critical', 'High', 'Medium', 'Low'], default: 'Medium' },
  businessRules: { type: [String], default: [] }, assumptions: { type: [String], default: [] }, dependencies: { type: [String], default: [] },
  status: { type: String, enum: ['Draft', 'PendingApproval', 'Approved', 'Rejected'], default: 'Draft', index: true },
  reviewNote: { type: String, default: '' }, approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null }, approvedAt: { type: Date, default: null },
  evidence: { type: Schema.Types.Mixed, default: {} }, createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, collection: 'e2e_use_cases' });
useCaseSchema.index({ project: 1, systemProfile: 1, status: 1 });
module.exports = mongoose.model('UseCase', useCaseSchema);
