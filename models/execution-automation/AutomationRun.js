const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  testCase: { type: mongoose.Schema.Types.ObjectId, ref: 'TestCase', required: true }, script: { type: mongoose.Schema.Types.ObjectId, ref: 'AutomationScript', required: true },
  profile: { type: mongoose.Schema.Types.ObjectId, ref: 'AutomationProfile', default: null }, environment: { type: mongoose.Schema.Types.ObjectId, ref: 'TestEnvironment', required: true },
  result: { type: mongoose.Schema.Types.ObjectId, ref: 'AutomationResult', default: null }, engine: { type: String, required: true },
  status: { type: String, enum: ['Queued', 'Preparing', 'Running', 'Collecting', 'Passed', 'Failed', 'Error', 'Cancelled'], default: 'Queued', index: true },
  jobId: { type: String, default: '' }, attempt: { type: Number, default: 0 }, error: { type: String, default: '' },
  startedAt: Date, completedAt: Date, requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  dataset: { type: mongoose.Schema.Types.ObjectId, ref: 'AutomationDataset' }, fixture: { type: mongoose.Schema.Types.ObjectId, ref: 'AutomationFixture' },
  schedule: { type: mongoose.Schema.Types.ObjectId, ref: 'AutomationSchedule' }, matrix: mongoose.Schema.Types.Mixed,
  dataRow: { type: Number, default: 0 }, groupId: String, triggeredBy: { type: String, default: 'Manual' },
  commitSha: String, targetUrl: String,
}, { timestamps: true, collection: 'automation_runs' });
module.exports = mongoose.model('AutomationRun', schema);
