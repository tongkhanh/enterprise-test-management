const mongoose = require('mongoose');
const {
  BoardItem, Sprint, ProjectLabel, ProjectMembership, TestCase,
  TestPlan, TestRun, TestExecution,
} = require('../models');
const { AppError, assertObjectId, send } = require('../utils/http');
const { assertProjectAccess } = require('../services/projectAccessService');
const { recordProjectActivity } = require('../services/projectActivityService');
const { nextPosition } = require('../services/boardService');

const STATUSES = ['Backlog', 'Todo', 'InProgress', 'InReview', 'Done'];
const transitions = {
  Backlog: ['Todo'],
  Todo: ['Backlog', 'InProgress'],
  InProgress: ['Todo', 'InReview'],
  InReview: ['InProgress', 'Done'],
  Done: ['InReview'],
};

const itemPopulate = [
  {
    path: 'testCase',
    select: 'title description preconditions priority type status estimatedTime testSteps tags storyCoverage targetUrl testSuite userStory createdBy',
    populate: [
      { path: 'testSuite', select: 'name project' },
      { path: 'userStory', select: 'title acceptanceCriteria' },
      { path: 'createdBy', select: 'fullName email' },
    ],
  },
  { path: 'cycle', select: 'name status startDate endDate color' },
  { path: 'assignee createdBy lastMovedBy', select: 'fullName email avatar' },
  { path: 'labels', select: 'name color description' },
  { path: 'testPlan', select: 'name status' },
  { path: 'testRun', select: 'name status passedCount failedCount totalCases' },
];

const listBoard = async (req, res) => {
  if (!req.query.project) throw new AppError('Project là bắt buộc.', 400);
  await assertProjectAccess(req.user, req.query.project);
  const filter = { project: req.query.project, isArchived: false };
  if (req.query.cycle === 'backlog') filter.cycle = null;
  else if (req.query.cycle) {
    assertObjectId(req.query.cycle, 'Cycle ID');
    filter.$or = [{ cycle: req.query.cycle }, { cycle: null }];
  }
  if (req.query.assignee) filter.assignee = req.query.assignee;
  if (req.query.priority) {
    const caseIds = await TestCase.find({ priority: req.query.priority }).distinct('_id');
    filter.testCase = { $in: caseIds };
  }
  const items = await BoardItem.find(filter).sort({ status: 1, position: 1, createdAt: 1 }).populate(itemPopulate);
  const columns = Object.fromEntries(STATUSES.map((status) => [status, []]));
  items.forEach((item) => columns[item.status].push(item));
  send(res, { columns, items, statuses: STATUSES, transitions });
};

const getBoardItem = async (req, res) => {
  assertObjectId(req.params.id, 'Board Item ID');
  const item = await BoardItem.findById(req.params.id).populate(itemPopulate);
  if (!item) throw new AppError('Board Item không tồn tại.', 404);
  await assertProjectAccess(req.user, item.project);
  send(res, item);
};

const updateBoardItem = async (req, res) => {
  const item = await BoardItem.findById(req.params.id);
  if (!item) throw new AppError('Board Item không tồn tại.', 404);
  await assertProjectAccess(req.user, item.project);
  if (req.body.cycle !== undefined) {
    if (req.body.cycle) {
      const cycle = await Sprint.findOne({ _id: req.body.cycle, project: item.project });
      if (!cycle) throw new AppError('Cycle không thuộc Project này.', 409);
      item.cycle = cycle._id;
    } else item.cycle = null;
  }
  if (req.body.assignee !== undefined) {
    if (req.body.assignee) {
      assertObjectId(req.body.assignee, 'Assignee ID');
      const member = await ProjectMembership.findOne({ project: item.project, user: req.body.assignee, isActive: true });
      if (!member) throw new AppError('Assignee phải là thành viên đang hoạt động của Project.', 409);
      item.assignee = member.user;
    } else item.assignee = null;
  }
  if (req.body.labels !== undefined) {
    const labels = await ProjectLabel.find({ _id: { $in: req.body.labels }, project: item.project });
    if (labels.length !== new Set(req.body.labels.map(String)).size) throw new AppError('Có Label không thuộc Project.', 409);
    item.labels = labels.map((label) => label._id);
  }
  if (req.body.estimate !== undefined) item.estimate = Math.max(0, Number(req.body.estimate) || 0);
  if (req.body.dueDate !== undefined) item.dueDate = req.body.dueDate || null;
  await item.save();
  await recordProjectActivity({ project: item.project, actor: req.user._id, action: 'UPDATED', entityType: 'TestCase', entityId: item.testCase, title: 'Đã cập nhật thuộc tính Board Item' });
  await item.populate(itemPopulate);
  send(res, item);
};

const moveBoardItem = async (req, res) => {
  const item = await BoardItem.findById(req.params.id);
  if (!item) throw new AppError('Board Item không tồn tại.', 404);
  await assertProjectAccess(req.user, item.project);
  const toStatus = req.body.status;
  if (!STATUSES.includes(toStatus)) throw new AppError('Trạng thái Board không hợp lệ.', 400);
  const fromStatus = item.status;
  if (fromStatus !== toStatus && !transitions[fromStatus]?.includes(toStatus)) {
    throw new AppError(`Không thể chuyển trực tiếp từ ${fromStatus} sang ${toStatus}.`, 409);
  }
  if (toStatus === 'InReview' && item.reviewState !== 'Approved') throw new AppError('Test Case cần được QA duyệt lại trước khi vào In Review.', 409);
  if (toStatus === 'Done' && !item.testRun) throw new AppError('Hãy tạo Test Plan/Test Run cho thẻ trước khi chuyển Done.', 409);

  const destinationCycle = req.body.cycle === undefined ? item.cycle : req.body.cycle || null;
  if (toStatus !== 'Backlog' && !destinationCycle) throw new AppError('Hãy gán Test Case vào một Cycle trước khi bắt đầu thực hiện.', 409);
  if (destinationCycle) {
    const cycle = await Sprint.findOne({ _id: destinationCycle, project: item.project });
    if (!cycle) throw new AppError('Cycle đích không thuộc Project.', 409);
  }
  let position = Number(req.body.position);
  if (!Number.isFinite(position) || position < 0) position = await nextPosition({ project: item.project, cycle: destinationCycle, status: toStatus });
  item.status = toStatus;
  item.cycle = destinationCycle;
  item.position = position;
  item.lastMovedBy = req.user._id;
  if (fromStatus !== toStatus) item.statusHistory.push({ from: fromStatus, to: toStatus, movedBy: req.user._id, movedAt: new Date() });
  await item.save();
  await recordProjectActivity({ project: item.project, actor: req.user._id, action: 'STATUS_CHANGED', entityType: 'TestCase', entityId: item.testCase, title: `Đã chuyển Test Case từ ${fromStatus} sang ${toStatus}` });
  await item.populate(itemPopulate);
  send(res, item);
};

const reorderColumn = async (req, res) => {
  const { project, cycle = null, status, itemIds } = req.body;
  if (!project || !STATUSES.includes(status) || !Array.isArray(itemIds) || !itemIds.length) throw new AppError('project, status và itemIds là bắt buộc.', 400);
  await assertProjectAccess(req.user, project);
  if (itemIds.some((id) => !mongoose.isValidObjectId(id))) throw new AppError('itemIds chứa ID không hợp lệ.', 400);
  const items = await BoardItem.find({ _id: { $in: itemIds }, project, status, cycle: cycle || null, isArchived: false });
  if (items.length !== new Set(itemIds.map(String)).size) throw new AppError('Danh sách sắp xếp không khớp cột hiện tại.', 409);
  await BoardItem.bulkWrite(itemIds.map((id, index) => ({ updateOne: { filter: { _id: id }, update: { $set: { position: (index + 1) * 1000, lastMovedBy: req.user._id } } } })));
  send(res, { itemIds });
};

const createPlanFromBoard = async (req, res) => {
  const { project, cycle, boardItemIds, name, environment = 'Staging' } = req.body;
  if (!project || !Array.isArray(boardItemIds) || !boardItemIds.length) throw new AppError('Project và danh sách Board Item là bắt buộc.', 400);
  if (boardItemIds.length > 100) throw new AppError('Mỗi Test Plan hỗ trợ tối đa 100 Test Case.', 400);
  await assertProjectAccess(req.user, project);
  const items = await BoardItem.find({ _id: { $in: boardItemIds }, project, isArchived: false }).populate('testCase');
  if (items.length !== new Set(boardItemIds.map(String)).size) throw new AppError('Có Board Item không tồn tại trong Project.', 404);
  const invalid = items.filter((item) => item.reviewState !== 'Approved' || !['Approved', 'Active'].includes(item.testCase?.status));
  if (invalid.length) throw new AppError('Chỉ có thể tạo Test Plan từ Test Case đang Approved.', 409, { invalidItems: invalid.map((item) => item._id) });
  if (cycle && items.some((item) => String(item.cycle || '') !== String(cycle))) throw new AppError('Các thẻ phải được gán vào Cycle đã chọn trước.', 409);

  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const now = new Date();
      const [plan] = await TestPlan.create([{
        name: name || `Cycle Test Plan · ${now.toLocaleString('vi-VN')}`,
        description: 'Được tạo từ Kanban Board sau khi QA phê duyệt.',
        scope: items.map((item) => item.testCase.title).join('; '), status: 'Active',
        environment, project, cycle: cycle || null, boardItems: items.map((item) => item._id),
        testCases: items.map((item) => item.testCase._id), assignee: req.body.assignee || req.user._id,
        createdBy: req.user._id, startDate: now,
      }], { session });
      const [run] = await TestRun.create([{
        name: req.body.runName || `Run · ${plan.name}`, description: 'Execution từ Kanban Board',
        environment, status: 'NotStarted', totalCases: items.length,
        testPlan: plan._id, assignee: plan.assignee, createdBy: req.user._id,
      }], { session });
      await TestExecution.insertMany(items.map((item) => ({ testRun: run._id, testCase: item.testCase._id, result: 'NotRun' })), { session });
      await BoardItem.updateMany({ _id: { $in: items.map((item) => item._id) } }, { $set: { testPlan: plan._id, testRun: run._id } }, { session });
      result = { plan, run };
    });
  } finally { await session.endSession(); }
  await recordProjectActivity({ project, actor: req.user._id, action: 'CREATED', entityType: 'TestCase', entityId: items[0].testCase._id, title: `Đã tạo Test Plan “${result.plan.name}” từ ${items.length} thẻ` });
  send(res, result, 201);
};

module.exports = { listBoard, getBoardItem, updateBoardItem, moveBoardItem, reorderColumn, createPlanFromBoard };
