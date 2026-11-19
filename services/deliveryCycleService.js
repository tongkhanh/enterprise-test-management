const DAY = 24 * 60 * 60 * 1000;

const startOfDay = (value) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const buildDeliveryCycleWindows = ({ anchorDate, durationWeeks, cooldownDays = 0, count, startSequence = 1 }) => {
  const durationDays = Number(durationWeeks) * 7;
  if (!anchorDate || !Number.isInteger(durationDays) || durationDays < 7) throw new Error('Cấu hình thời lượng Delivery Cycle không hợp lệ.');
  return Array.from({ length: Number(count) }, (_, index) => {
    const sequence = Number(startSequence) + index;
    const startDate = new Date(startOfDay(anchorDate).getTime() + index * (durationDays + Number(cooldownDays)) * DAY);
    const endDate = new Date(startDate.getTime() + durationDays * DAY - 1);
    return { sequence, name: `Cycle ${sequence}`, startDate, endDate };
  });
};

module.exports = { buildDeliveryCycleWindows };
