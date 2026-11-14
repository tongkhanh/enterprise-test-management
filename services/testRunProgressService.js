const { TestExecution, TestRun } = require('../models');

async function recalculateRun(runId) {
  for (;;) {
    const run = await TestRun.findById(runId).select('__v startedAt completedAt').lean();
    if (!run) return null;
    const groups = await TestExecution.aggregate([
      { $match: { testRun: runId } },
      { $group: { _id: '$result', count: { $sum: 1 } } },
    ]);
    const counts = Object.fromEntries(groups.map((group) => [group._id, group.count]));
    const totalCases = Object.values(counts).reduce((total, count) => total + count, 0);
    const completed = totalCases > 0 && !counts.NotRun;
    const now = new Date();
    const updated = await TestRun.findOneAndUpdate({ _id: runId, __v: run.__v ?? null }, {
      $set: {
        totalCases,
        passedCount: counts.Passed || 0,
        failedCount: counts.Failed || 0,
        blockedCount: counts.Blocked || 0,
        skippedCount: counts.Skipped || 0,
        status: completed ? 'Completed' : 'InProgress',
        startedAt: run.startedAt || now,
        completedAt: completed ? run.completedAt || now : null,
      },
      $inc: { __v: 1 },
    }, { new: true });
    if (updated) return updated;
  }
}

module.exports = { recalculateRun };
