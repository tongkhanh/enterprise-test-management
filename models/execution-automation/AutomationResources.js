const mongoose = require('mongoose');
const { Schema } = mongoose;
const reference = (ref, required = false) => ({ type: Schema.Types.ObjectId, ref, required });
const common = { project: reference('Project', true), name: { type: String, required: true, maxlength: 200 }, createdBy: reference('User', true) };
const Dataset = mongoose.model('AutomationDataset', new Schema({ ...common, columns: [String], rowCount: Number, encryptedRows: { type: String, required: true, select: false } }, { timestamps: true }));
const Fixture = mongoose.model('AutomationFixture', new Schema({ ...common, environment: reference('TestEnvironment', true), setup: [{ method: String, path: String, body: Schema.Types.Mixed }], teardown: [{ method: String, path: String, body: Schema.Types.Mixed }] }, { timestamps: true }));
const Schedule = mongoose.model('AutomationSchedule', new Schema({ ...common, cron: { type: String, required: true }, timezone: { type: String, default: 'Asia/Bangkok' }, environment: reference('TestEnvironment', true), suite: reference('TestSuite'), cycle: reference('Sprint'), scripts: [reference('AutomationScript')], dataset: reference('AutomationDataset'), fixture: reference('AutomationFixture'), matrix: [Schema.Types.Mixed], active: { type: Boolean, default: true }, lastTriggeredAt: Date, leaseUntil: Date, lastError: String }, { timestamps: true }));
const Health = mongoose.model('WorkerHealth', new Schema({ name: { type: String, unique: true }, lastSeen: Date, hostname: String, pid: Number, lastAlertAt: Date }, { timestamps: true }));
module.exports = { Dataset, Fixture, Schedule, Health };
