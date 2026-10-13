const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  name: { type: String, required: true, trim: true }, engine: { type: String, enum: ['Playwright', 'Selenium', 'Cypress', 'WebdriverIO', 'RobotFramework'], required: true },
  image: { type: String, default: '' }, command: { type: [String], default: [] }, browser: { type: String, default: 'chromium' },
  timeoutMs: { type: Number, default: 300000 }, retries: { type: Number, default: 1 },
  resourceLimits: { cpus: { type: Number, default: 1 }, memoryMb: { type: Number, default: 1024 } },
  isDefault: { type: Boolean, default: false }, createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, collection: 'automation_profiles' });
module.exports = mongoose.model('AutomationProfile', schema);
