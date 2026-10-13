const { UserKpi } = require('../models');

const rankFor = (points) => {
  if (points >= 1000) return 'Diamond';
  if (points >= 500) return 'Platinum';
  if (points >= 250) return 'Gold';
  if (points >= 100) return 'Silver';
  if (points >= 40) return 'Bronze';
  return 'Rookie';
};

const addKpiPoints = async ({ user, project, points, reason, entityType, entityId, counters = {} }) => {
  if (!user || !project) return null;
  const kpi = await UserKpi.findOneAndUpdate(
    { user, project, period: 'all-time', periodValue: 'all-time' },
    { $setOnInsert: { user, project, period: 'all-time', periodValue: 'all-time' } },
    { upsert: true, new: true }
  );
  kpi.totalPoints += points;
  kpi.pointsHistory.push({ points, reason, relatedEntity: { entityType, entityId } });
  Object.entries(counters).forEach(([path, amount]) => kpi.set(path, (kpi.get(path) || 0) + amount));
  kpi.rank = rankFor(kpi.totalPoints);
  if (counters['bugsFound.critical'] && !kpi.badges.includes('Critical Finder')) kpi.badges.push('Critical Finder');
  await kpi.save();
  return kpi;
};

module.exports = { addKpiPoints, rankFor };
