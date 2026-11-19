const mongoose = require('mongoose');

const deliveryCycleSchema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },
  name: { type: String, required: true, trim: true, maxlength: 200 },
  sequence: { type: Number, required: true, min: 1 },
  goal: { type: String, trim: true, default: '', maxlength: 2000 },
  description: { type: String, trim: true, default: '', maxlength: 5000 },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  status: {
    type: String,
    enum: ['Upcoming', 'Active', 'Completed', 'Cancelled'],
    default: 'Upcoming',
    index: true,
  },
  capacity: { type: Number, min: 0, default: 0 },
  velocity: { type: Number, min: 0, default: 0 },
  color: { type: String, default: '#6D5DFB', match: /^#[0-9A-F]{6}$/i },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, collection: 'delivery_cycles' });

deliveryCycleSchema.index({ project: 1, team: 1, sequence: 1 }, { unique: true });
deliveryCycleSchema.index({ project: 1, team: 1, startDate: 1 });
deliveryCycleSchema.pre('validate', function validateDates(next) {
  if (this.startDate && this.endDate && this.endDate <= this.startDate) {
    this.invalidate('endDate', 'Ngày kết thúc phải sau ngày bắt đầu.');
  }
  next();
});

module.exports = mongoose.model('DeliveryCycle', deliveryCycleSchema);
