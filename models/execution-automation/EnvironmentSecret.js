const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  environment: { type: mongoose.Schema.Types.ObjectId, ref: 'TestEnvironment', required: true, index: true },
  name: { type: String, required: true, trim: true, match: /^[A-Z_][A-Z0-9_]*$/ },
  valueCiphertext: { type: String, required: true, select: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  rotatedAt: { type: Date, default: Date.now },
}, { timestamps: true, collection: 'environment_secrets' });
schema.index({ environment: 1, name: 1 }, { unique: true });
module.exports = mongoose.model('EnvironmentSecret', schema);
