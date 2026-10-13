const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  identifier: { type: String, required: true, unique: true }, number: { type: Number, required: true },
  title: { type: String, required: true, trim: true }, description: { type: String, default: '' },
  type: { type: String, enum: ['Epic', 'Task', 'Subtask', 'TestingTask'], default: 'Task' },
  status: { type: String, enum: ['Backlog', 'Todo', 'InProgress', 'InReview', 'Done', 'Cancelled'], default: 'Backlog', index: true },
  approvalStatus: { type: String, enum: ['Draft', 'PendingApproval', 'Approved', 'Rejected'], default: 'Draft', index: true },
  reviewNote: { type: String, default: '' }, approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, approvedAt: { type: Date, default: null },
  priority: { type: String, enum: ['Urgent', 'High', 'Medium', 'Low', 'None'], default: 'None' },
  parent: { type: mongoose.Schema.Types.ObjectId, ref: 'AgileIssue', default: null }, children: [{ type: mongoose.Schema.Types.ObjectId, ref: 'AgileIssue' }],
  blocks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'AgileIssue' }], blockedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'AgileIssue' }],
  cycle: { type: mongoose.Schema.Types.ObjectId, ref: 'Sprint', default: null }, assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  testCase: { type: mongoose.Schema.Types.ObjectId, ref: 'TestCase', default: null }, testPlan: { type: mongoose.Schema.Types.ObjectId, ref: 'TestPlan', default: null },
  estimate: { type: Number, default: 0 }, position: { type: Number, default: 1000 }, labels: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ProjectLabel' }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, collection: 'agile_issues' });
schema.index({ project: 1, number: 1 }, { unique: true }); schema.index({ project: 1, cycle: 1, status: 1, position: 1 });
module.exports = mongoose.model('AgileIssue', schema);
