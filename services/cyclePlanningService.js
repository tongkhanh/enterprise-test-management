const { AppError } = require('../utils/http');
const statusNames = ['Backlog', 'Todo', 'InProgress', 'InReview', 'Done'];
const id = (value) => String(value?._id || value || '');
const minutes = (item) => Math.max(0, Number(item.estimate || item.testCase?.estimatedTime) || 0);
const normalizedText = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
function caseIdentity(item) {
  const testCase = item?.testCase || item || {};
  const basis = testCase.primaryTestBasis || {};
  const basisId = id(basis.basisId || testCase.e2e?.useCase);
  const title = normalizedText(testCase.title);
  return basisId && title ? `${basis.basisType || 'UseCase'}:${basisId}|${title}` : `TestCase:${id(testCase?._id) || id(item)}`;
}
function deduplicateCases(items = []) {
  const seen = new Set();
  const unique = [];
  const duplicates = [];
  for (const item of items) {
    const key = caseIdentity(item);
    if (seen.has(key)) duplicates.push(item);
    else { seen.add(key); unique.push(item); }
  }
  return { unique, duplicates };
}
function caseScope(plan) {
  const scopes = [];
  const testCases = (plan.testCases || []).map(id).filter(Boolean);
  const requirements = (plan.requirements || []).map(id).filter(Boolean);
  const userStories = (plan.userStories || []).map(id).filter(Boolean);
  const useCases = (plan.useCases || []).map(id).filter(Boolean);
  if (testCases.length) scopes.push({ _id: { $in: testCases } });
  if (plan._id) scopes.push({ 'e2e.testPlan': plan._id });
  if (plan.systemProfile) scopes.push({ 'e2e.systemProfile': plan.systemProfile });
  if (requirements.length) scopes.push(
    { linkedRequirements: { $in: requirements } },
    { 'e2e.requirements': { $in: requirements } },
    { 'primaryTestBasis.basisType': 'Requirement', 'primaryTestBasis.basisId': { $in: requirements } },
  );
  if (userStories.length) scopes.push(
    { userStory: { $in: userStories } },
    { linkedUserStories: { $in: userStories } },
    { 'primaryTestBasis.basisType': 'UserStory', 'primaryTestBasis.basisId': { $in: userStories } },
  );
  if (useCases.length) scopes.push(
    { 'e2e.useCase': { $in: useCases } },
    { linkedUseCases: { $in: useCases } },
    { 'primaryTestBasis.basisType': 'UseCase', 'primaryTestBasis.basisId': { $in: useCases } },
  );
  if (!scopes.length) throw new AppError('Test Plan chưa liên kết Test Case, System Profile hoặc Test Basis. Hãy hoàn thiện liên kết ở bước thiết kế.', 409);
  return scopes.length === 1 ? scopes[0] : { $or: scopes };
}
function summarize(items) {
  return { total: items.length, estimatedMinutes: items.reduce((sum, item) => sum + minutes(item), 0), unknownEstimates: items.filter((item) => !minutes(item)).length, byStatus: Object.fromEntries(statusNames.map((status) => [status, items.filter((item) => item.status === status).length])) };
}
function limits(body, cycle) {
  const capacityMinutes = Number(body.capacityMinutes ?? (cycle.planningCapacityMinutes || 480));
  const maxCases = Number(body.maxCases ?? cycle.planningMaxCases ?? 0);
  if (!Number.isFinite(capacityMinutes) || capacityMinutes < 1 || capacityMinutes > 100000 || !Number.isInteger(maxCases) || maxCases < 0 || maxCases > 500) throw new AppError('Nhập thời gian từ 1 đến 100000 phút; giới hạn Test Case từ 1 đến 500 hoặc để trống.', 400);
  return { capacityMinutes, maxCases };
}
function choose(items, occupied, budget, ranked = []) {
  const available = deduplicateCases(items.filter((item) => !item.cycle && item.status === 'Backlog' && item.reviewState === 'Approved' && ['Approved', 'Active'].includes(item.testCase?.status))).unique;
  const rank = new Map(ranked.map((row, index) => [id(row.boardItemId), { index, reason: String(row.reason || '').slice(0, 1000) }]));
  const priorities = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  available.sort((a, b) => (rank.get(id(a))?.index ?? 1000) - (rank.get(id(b))?.index ?? 1000) || (priorities[a.testCase?.priority] ?? 4) - (priorities[b.testCase?.priority] ?? 4) || id(a).localeCompare(id(b)));
  let remaining = budget.capacityMinutes - occupied.estimatedMinutes;
  let slots = budget.maxCases > 0 ? budget.maxCases - occupied.total : Number.POSITIVE_INFINITY;
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
  if (deduplicateCases(selected).duplicates.length) throw new AppError('Danh sách có Test Case trùng cùng Test Basis và kịch bản. Giữ lại một bản trước khi áp dụng.', 409);
  const total = summarize([...existing, ...selected]);
  if (total.unknownEstimates) throw new AppError('Bổ sung thời gian ước tính cho Test Case trước khi áp dụng kế hoạch có giới hạn thời gian.', 409);
  if (total.estimatedMinutes > budget.capacityMinutes || (budget.maxCases > 0 && total.total > budget.maxCases)) throw new AppError('Tổng Test Case trong Cycle vượt capacity hoặc giới hạn số lượng đã cấu hình. Điều chỉnh lựa chọn hoặc giới hạn.', 409);
  return { selected, total };
}

function roadmapLimits(body = {}) {
  const capacityMinutes = Number(body.capacityMinutes || 480);
  const maxCases = Number(body.maxCases || 0);
  const cycleCount = Number(body.cycleCount || 0);
  if (!Number.isFinite(capacityMinutes) || capacityMinutes < 1 || capacityMinutes > 100000) throw new AppError('Capacity mỗi Cycle phải từ 1 đến 100000 phút.', 400);
  if (!Number.isInteger(maxCases) || maxCases < 0 || maxCases > 500) throw new AppError('Giới hạn Test Case mỗi Cycle phải từ 1 đến 500 hoặc để trống.', 400);
  if (!Number.isInteger(cycleCount) || cycleCount < 0 || cycleCount > 20) throw new AppError('Số Cycle phải từ 1 đến 20 hoặc để AI tự tính.', 400);
  return { capacityMinutes, maxCases, cycleCount };
}

function cycleSignature(cycle = {}) {
  const name = String(cycle.name || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
  const date = (value) => {
    const parsed = value instanceof Date ? value : new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : '';
  };
  return `${name}|${date(cycle.startDate)}|${date(cycle.endDate)}`;
}

function buildRoadmap(items, options = {}, ranked = []) {
  const limits = roadmapLimits(options);
  const rawCandidates = items.filter((item) => !item.cycle && item.status === 'Backlog' && item.reviewState === 'Approved' && ['Approved', 'Active'].includes(item.testCase?.status));
  const { unique: candidates, duplicates } = deduplicateCases(rawCandidates);
  const unknown = candidates.filter((item) => !minutes(item));
  const rank = new Map(ranked.map((row, index) => [id(row.boardItemId), { index, reason: String(row.reason || '').slice(0, 1000), group: Number(row.cycleNumber) || 0 }]));
  const priorities = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  const ready = candidates.filter((item) => minutes(item)).sort((a, b) =>
    (rank.get(id(a))?.index ?? 1000) - (rank.get(id(b))?.index ?? 1000) ||
    (priorities[a.testCase?.priority] ?? 4) - (priorities[b.testCase?.priority] ?? 4) || id(a).localeCompare(id(b))
  );
  const totalMinutes = ready.reduce((sum, item) => sum + minutes(item), 0);
  const countBasedCycles = limits.maxCases > 0 ? Math.ceil(ready.length / limits.maxCases) : 1;
  const minimumCycles = Math.max(1, Math.ceil(totalMinutes / limits.capacityMinutes), countBasedCycles);
  const cycleCount = limits.cycleCount || minimumCycles;
  const cycles = Array.from({ length: cycleCount }, (_, index) => ({
    clientId: `cycle-${index + 1}`,
    name: `Test Cycle ${index + 1}`,
    goal: index === 0 ? 'Ưu tiên luồng Critical/High và điều kiện chặn.' : index === cycleCount - 1 ? 'Hoàn tất coverage còn lại và regression trước phát hành.' : 'Thực thi phạm vi theo rủi ro và capacity.',
    cycleType: index === 0 ? 'Smoke' : index === cycleCount - 1 ? 'Regression' : 'Functional',
    capacityMinutes: limits.capacityMinutes,
    maxCases: limits.maxCases,
    assignments: [], estimatedMinutes: 0,
  }));
  for (const item of ready) {
    const preferred = rank.get(id(item))?.group;
    const fitting = cycles.filter((cycle) => (!cycle.maxCases || cycle.assignments.length < cycle.maxCases) && cycle.estimatedMinutes + minutes(item) <= cycle.capacityMinutes);
    const empty = limits.cycleCount ? fitting.filter((cycle) => !cycle.assignments.length) : [];
    const preferredCycle = preferred ? cycles[preferred - 1] : null;
    const target = (preferredCycle && empty.includes(preferredCycle) && preferredCycle)
      || empty[0]
      || (preferredCycle && fitting.includes(preferredCycle) && preferredCycle)
      || fitting.sort((a, b) => a.estimatedMinutes / a.capacityMinutes - b.estimatedMinutes / b.capacityMinutes || a.assignments.length - b.assignments.length)[0];
    if (!target) continue;
    target.assignments.push({ boardItemId: id(item), reason: rank.get(id(item))?.reason || 'Ưu tiên theo risk, priority và capacity còn lại.' });
    target.estimatedMinutes += minutes(item);
  }
  const assigned = new Set(cycles.flatMap((cycle) => cycle.assignments.map((row) => row.boardItemId)));
  return {
    cycles,
    unassigned: [
      ...candidates.filter((item) => !assigned.has(id(item))).map((item) => ({ boardItemId: id(item), reason: minutes(item) ? 'Không còn capacity phù hợp.' : 'Thiếu thời gian ước tính.' })),
      ...duplicates.map((item) => ({ boardItemId: id(item), reason: 'Trùng Test Basis và kịch bản với một Test Case khác trong phạm vi roadmap.' })),
    ],
    summary: { candidateCount: rawCandidates.length, assignedCount: assigned.size, totalMinutes, minimumCycles, missingEstimates: unknown.length, duplicateCandidates: duplicates.length },
  };
}

module.exports = { id, minutes, caseIdentity, deduplicateCases, caseScope, summarize, limits, choose, validateAssignment, roadmapLimits, cycleSignature, buildRoadmap };
