const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  testCase: { type: mongoose.Schema.Types.ObjectId, ref: 'TestCase', required: true, index: true },
  engine: { type: String, enum: ['Playwright', 'Selenium', 'Cypress', 'WebdriverIO', 'RobotFramework'], required: true },
  language: { type: String, enum: ['TypeScript', 'JavaScript', 'Python', 'Robot'], required: true },
  filename: { type: String, required: true },
  code: { type: String, required: true, maxlength: 500000 },
  status: { type: String, enum: ['Generated', 'Validated', 'Approved', 'Rejected'], default: 'Generated' },
  validation: [{ level: { type: String, enum: ['warning', 'error'] }, message: String, stepNumber: Number }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  approvedAt: { type: Date, default: null },
  reviewNote: { type: String, default: '', maxlength: 2000 },
}, { timestamps: true, collection: 'automation_scripts' });

schema.index({ testCase: 1, engine: 1, createdAt: -1 });
module.exports = mongoose.model('AutomationScript', schema);
