const { AppError } = require('../utils/http');
const statusNames = ['Backlog', 'Todo', 'InProgress', 'InReview', 'Done'];
const id = (value) => String(value?._id || value || '');
const minutes = (item) => Math.max(0, Number(item.estimate || item.testCase?.estimatedTime) || 0);
function caseScope(plan) {
  if (plan.testCases?.length) return { _id: { $in: plan.testCases.map(id) } };
  if (plan.systemProfile && plan.userStories?.length) return { 'e2e.systemProfile': plan.systemProfile, userStory: { $in: plan.userStories.map(id) }, ...(plan._id ? { $or: [{ 'e2e.testPlan': plan._id }, { 'e2e.testPlan': null }] } : {}) };
  throw new AppError('Test Plan chưa liên kết Test Case hoặc User Story trong Profile. Hãy hoàn thiện liên kết ở bước thiết kế.', 409);
}
function summarize(items) {
  return { total: items.length, estimatedMinutes: items.reduce((sum, item) => sum + minutes(item), 0), unknownEstimates: items.filter((item) => !minutes(item)).length, byStatus: Object.fromEntries(statusNames.map((status) => [status, items.filter((item) => item.status === status).length])) };
}
function limits(body, cycle) {
  const capacityMinutes = Number(body.capacityMinutes ?? (cycle.planningCapacityMinutes || 480));
  const maxCases = Number(body.maxCases ?? (cycle.planningMaxCases || 20));
  if (!Number.isFinite(capacityMinutes) || capacityMinutes < 1 || capacityMinutes > 100000 || !Number.isInteger(maxCases) || maxCases < 1 || maxCases > 100) throw new AppError('Nhập thời gian từ 1 đến 100000 phút và số lượng Test Case từ 1 đến 100.', 400);
  return { capacityMinutes, maxCases };
}
function choose(items, occupied, budget, ranked = []) {
  const available = items.filter((item) => !item.cycle && item.status === 'Backlog' && item.reviewState === 'Approved' && ['Approved', 'Active'].includes(item.testCase?.status));
  const rank = new Map(ranked.map((row, index) => [id(row.boardItemId), { index, reason: String(row.reason || '').slice(0, 1000) }]));
  const priorities = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  available.sort((a, b) => (rank.get(id(a))?.index ?? 1000) - (rank.get(id(b))?.index ?? 1000) || (priorities[a.testCase?.priority] ?? 4) - (priorities[b.testCase?.priority] ?? 4) || id(a).localeCompare(id(b)));
  let remaining = budget.capacityMinutes - occupied.estimatedMinutes;
  let slots = budget.maxCases - occupied.total;
  const selected = [];
  for (const item of available) {
    const estimate = minutes(item);
    if (!estimate || estimate > remaining || slots <= 0) continue;
    selected.push({ boardItemId: id(item), reason: rank.get(id(item))?.reason || 'Ưu tiên theo mức độ rủi ro và khối lượng còn lại của Cycle.' });
    remaining -= estimate; slots--;
  }
  return selected;
}
function validateAssignment(items, selectedIds, existing, budget) {
  const ids = selectedIds.map(String);
  if (new Set(ids).size !== ids.length) throw new AppError('Danh sách Test Case bị trùng.', 400);
  const selected = items.filter((item) => ids.includes(id(item)));
  if (selected.length !== ids.length || selected.some((item) => item.cycle || item.status !== 'Backlog' || item.reviewState !== 'Approved' || !['Approved', 'Active'].includes(item.testCase?.status))) throw new AppError('Có Test Case đã đổi trạng thái, thuộc Cycle khác hoặc không thuộc Test Plan. Tải lại kế hoạch.', 409);
  const total = summarize([...existing, ...selected]);
  if (total.unknownEstimates) throw new AppError('Bổ sung thời gian ước tính cho Test Case trước khi áp dụng kế hoạch có giới hạn thời gian.', 409);
  if (total.estimatedMinutes > budget.capacityMinutes || total.total > budget.maxCases) throw new AppError('Tổng Test Case trong Cycle vượt thời gian hoặc số lượng đã đặt. Điều chỉnh lựa chọn hoặc giới hạn.', 409);
  return { selected, total };
}
module.exports = { id, minutes, caseScope, summarize, limits, choose, validateAssignment };
