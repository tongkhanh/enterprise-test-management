const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  testPlan: { type: mongoose.Schema.Types.ObjectId, ref: 'TestPlan', default: null },
  testRun: { type: mongoose.Schema.Types.ObjectId, ref: 'TestRun', required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 300 },
  executiveSummary: { type: String, required: true, maxlength: 20000 },
  reportId: { type: String, default: '' },
  scope: { type: [String], default: [] },
  environment: { type: String, default: '' },
  coverage: { type: mongoose.Schema.Types.Mixed, default: {} },
  executionDetails: { type: [mongoose.Schema.Types.Mixed], default: [] },
  defectSummary: { type: [mongoose.Schema.Types.Mixed], default: [] },
  releaseRecommendation: { type: String, enum: ['Go', 'GoWithRisk', 'NoGo', 'Pending'], default: 'Pending' },
  highlights: { type: [String], default: [] },
  risks: { type: [String], default: [] },
  recommendations: { type: [String], default: [] },
  metrics: { type: mongoose.Schema.Types.Mixed, default: {} },
  status: { type: String, enum: ['PendingApproval', 'Approved', 'Rejected'], default: 'PendingApproval', index: true },
  reviewNote: { type: String, default: '', maxlength: 2000 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  approvedAt: { type: Date, default: null },
  aiMetadata: { provider: String, model: String, generatedAt: Date },
}, { timestamps: true, collection: 'test_reports' });

schema.index({ project: 1, createdAt: -1 });
module.exports = mongoose.model('TestReport', schema);
