const mongoose = require('mongoose');

const statusHistorySchema = new mongoose.Schema({
  from: { type: String, default: null },
  to: { type: String, required: true },
  movedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  movedAt: { type: Date, default: Date.now },
}, { _id: false });

const boardItemSchema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  cycle: { type: mongoose.Schema.Types.ObjectId, ref: 'Sprint', default: null },
  testCase: { type: mongoose.Schema.Types.ObjectId, ref: 'TestCase', required: true, unique: true },
  reviewRequest: { type: mongoose.Schema.Types.ObjectId, ref: 'ReviewRequest', default: null },
  status: {
    type: String,
    enum: ['Backlog', 'Todo', 'InProgress', 'InReview', 'Done'],
    default: 'Backlog',
  },
  reviewState: { type: String, enum: ['Approved', 'NeedsReview', 'Rejected'], default: 'Approved' },
  position: { type: Number, default: 1000 },
  assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  labels: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ProjectLabel' }],
  estimate: { type: Number, min: 0, default: 0 },
  dueDate: { type: Date, default: null },
  testPlan: { type: mongoose.Schema.Types.ObjectId, ref: 'TestPlan', default: null },
  testRun: { type: mongoose.Schema.Types.ObjectId, ref: 'TestRun', default: null },
  isArchived: { type: Boolean, default: false },
  archivedReason: { type: String, default: null },
  statusHistory: { type: [statusHistorySchema], default: [] },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  lastMovedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, collection: 'board_items' });

boardItemSchema.index({ project: 1, cycle: 1, status: 1, position: 1 });
boardItemSchema.index({ assignee: 1, status: 1 });
boardItemSchema.index({ project: 1, isArchived: 1 });
boardItemSchema.index({ testPlan: 1 });

module.exports = mongoose.model('BoardItem', boardItemSchema);
