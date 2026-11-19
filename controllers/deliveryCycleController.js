const { DeliveryCycle, DeliveryCycleConfig, AgileIssue } = require('../models');
const { buildDeliveryCycleWindows } = require('../services/deliveryCycleService');
const { AppError, send } = require('../utils/http');
const { assertProjectAccess } = require('../services/projectAccessService');

const list = async (req, res) => {
  if (!req.query.project) throw new AppError('Project là bắt buộc.', 400);
  await assertProjectAccess(req.user, req.query.project);
  const filter = { project: req.query.project, team: req.query.team || null };
  const [cycles, config] = await Promise.all([
    DeliveryCycle.find(filter).populate('team', 'name').populate('createdBy', 'fullName').sort({ startDate: 1 }).lean(),
    DeliveryCycleConfig.findOne(filter).lean(),
  ]);
  const issueCounts = cycles.length ? await AgileIssue.aggregate([
    { $match: { project: cycles[0].project, cycle: { $in: cycles.map((cycle) => cycle._id) } } },
    { $group: { _id: '$cycle', total: { $sum: 1 }, done: { $sum: { $cond: [{ $eq: ['$status', 'Done'] }, 1, 0] } } } },
  ]) : [];
  const counts = new Map(issueCounts.map((item) => [String(item._id), item]));
  send(res, { cycles: cycles.map((cycle) => ({ ...cycle, issueSummary: counts.get(String(cycle._id)) || { total: 0, done: 0 } })), config });
};

const configure = async (req, res) => {
  const { project, team = null, anchorDate, durationWeeks = 2, cooldownDays = 0, futureCount = 3, rolloverOpenIssues = true } = req.body;
  if (!project || !anchorDate) throw new AppError('Project và ngày bắt đầu là bắt buộc.', 400);
  await assertProjectAccess(req.user, project, { manage: true });
  const config = await DeliveryCycleConfig.findOneAndUpdate(
    { project, team },
    { project, team, anchorDate, durationWeeks, cooldownDays, futureCount, rolloverOpenIssues, enabled: true, updatedBy: req.user._id },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );
  const [latest, remaining] = await Promise.all([
    DeliveryCycle.findOne({ project, team }).sort({ sequence: -1 }).select('sequence endDate'),
    DeliveryCycle.countDocuments({ project, team, status: 'Upcoming' }),
  ]);
  const missingCount = Math.max(0, Number(futureCount) - remaining);
  const startSequence = (latest?.sequence || 0) + 1;
  const nextAnchor = latest ? new Date(new Date(latest.endDate).getTime() + (Number(cooldownDays) + 1) * 24 * 60 * 60 * 1000) : anchorDate;
  const windows = buildDeliveryCycleWindows({ anchorDate: nextAnchor, durationWeeks: Number(durationWeeks), cooldownDays: Number(cooldownDays), count: missingCount, startSequence });
  const created = await DeliveryCycle.insertMany(windows.map((window) => ({ ...window, project, team, createdBy: req.user._id })));
  send(res, { config, created }, 201);
};

const update = async (req, res) => {
  const cycle = await DeliveryCycle.findById(req.params.id);
  if (!cycle) throw new AppError('Delivery Cycle không tồn tại.', 404);
  await assertProjectAccess(req.user, cycle.project, { manage: true });
  const previousStatus = cycle.status;
  ['name', 'goal', 'description', 'startDate', 'endDate', 'status', 'capacity', 'velocity', 'color'].forEach((key) => {
    if (req.body[key] !== undefined) cycle[key] = req.body[key];
  });
  if (cycle.status === 'Active') {
    const current = await DeliveryCycle.findOne({ project: cycle.project, team: cycle.team, status: 'Active', _id: { $ne: cycle._id } });
    if (current) throw new AppError(`Hãy hoàn tất ${current.name} trước khi bắt đầu Cycle mới.`, 409);
  }
  await cycle.save();
  if (previousStatus !== 'Completed' && cycle.status === 'Completed') {
    const config = await DeliveryCycleConfig.findOne({ project: cycle.project, team: cycle.team });
    if (config?.rolloverOpenIssues) {
      const next = await DeliveryCycle.findOne({ project: cycle.project, team: cycle.team, status: 'Upcoming', startDate: { $gte: cycle.endDate } }).sort({ startDate: 1 });
      if (next) await AgileIssue.updateMany({ project: cycle.project, cycle: cycle._id, status: { $nin: ['Done', 'Cancelled'] } }, { cycle: next._id });
    }
  }
  send(res, cycle);
};

module.exports = { list, configure, update };
