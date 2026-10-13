const { Sprint, UserStory, ProjectLabel, ProjectActivity } = require('../models');
const { AppError, list, getById, send } = require('../utils/http');
const { getAccessibleProjectIds, assertProjectAccess } = require('../services/projectAccessService');
const { recordProjectActivity } = require('../services/projectActivityService');

const scopedProjectFilter = async (req) => {
  if (req.query.project) {
    await assertProjectAccess(req.user, req.query.project);
    return { project: req.query.project };
  }
  const projectIds = await getAccessibleProjectIds(req.user);
  return projectIds ? { project: { $in: projectIds } } : {};
};

const listCycles = async (req, res) => {
  const result = await list(Sprint, req, {
    baseFilter: await scopedProjectFilter(req),
    filters: ['status'],
    searchFields: ['name', 'goal', 'description'],
    sort: 'startDate',
    populate: [{ path: 'project', select: 'name key' }, { path: 'createdBy', select: 'fullName' }],
  });
  send(res, result.data, 200, { pagination: result.pagination });
};

const createCycle = async (req, res) => {
  if (!req.body.project) throw new AppError('Project là bắt buộc.', 400);
  if (!req.body.name?.trim()) throw new AppError('Tên Cycle là bắt buộc.', 400);
  await assertProjectAccess(req.user, req.body.project, { manage: true });
  if (!req.body.startDate || !req.body.endDate || new Date(req.body.endDate) <= new Date(req.body.startDate)) {
    throw new AppError('Ngày kết thúc Cycle phải sau ngày bắt đầu.', 400);
  }
  const latest = await Sprint.findOne({ project: req.body.project }).sort('-sequence').select('sequence');
  const cycle = await Sprint.create({
    ...req.body,
    name: req.body.name.trim(),
    sequence: req.body.sequence || (latest?.sequence || 0) + 1,
    createdBy: req.user._id,
  });
  await recordProjectActivity({ project: cycle.project, actor: req.user._id, action: 'CREATED', entityType: 'Cycle', entityId: cycle._id, title: `Đã tạo Cycle ${cycle.name}`, description: cycle.goal });
  send(res, cycle, 201);
};

const updateCycle = async (req, res) => {
  const cycle = await getById(Sprint, req.params.id);
  await assertProjectAccess(req.user, cycle.project, { manage: true });
  const before = cycle.toObject();
  ['name', 'goal', 'description', 'startDate', 'endDate', 'status', 'velocity', 'capacity', 'color'].forEach((key) => {
    if (req.body[key] !== undefined) cycle[key] = req.body[key];
  });
  if (new Date(cycle.endDate) <= new Date(cycle.startDate)) throw new AppError('Ngày kết thúc Cycle phải sau ngày bắt đầu.', 400);
  await cycle.save();
  await recordProjectActivity({
    project: cycle.project, actor: req.user._id,
    action: before.status !== cycle.status ? 'STATUS_CHANGED' : 'UPDATED',
    entityType: 'Cycle', entityId: cycle._id, title: `Đã cập nhật Cycle ${cycle.name}`,
    changes: { before, after: cycle.toObject() },
  });
  send(res, cycle);
};

const deleteCycle = async (req, res) => {
  const cycle = await getById(Sprint, req.params.id);
  await assertProjectAccess(req.user, cycle.project, { manage: true });
  const assignedStories = await UserStory.countDocuments({ sprint: cycle._id });
  if (assignedStories) throw new AppError(`Không thể xóa Cycle đang chứa ${assignedStories} User Story. Hãy chuyển chúng về Backlog trước.`, 409);
  await cycle.deleteOne();
  await recordProjectActivity({ project: cycle.project, actor: req.user._id, action: 'DELETED', entityType: 'Cycle', entityId: cycle._id, title: `Đã xóa Cycle ${cycle.name}` });
  send(res, { _id: cycle._id });
};

const listLabels = async (req, res) => {
  if (!req.query.project) throw new AppError('Project là bắt buộc.', 400);
  await assertProjectAccess(req.user, req.query.project);
  const result = await list(ProjectLabel, req, {
    baseFilter: { project: req.query.project }, filters: ['isArchived'],
    searchFields: ['name', 'description'], sort: 'name',
    populate: { path: 'createdBy', select: 'fullName' },
  });
  send(res, result.data, 200, { pagination: result.pagination });
};

const createLabel = async (req, res) => {
  if (!req.body.project || !req.body.name?.trim()) throw new AppError('Project và tên Label là bắt buộc.', 400);
  await assertProjectAccess(req.user, req.body.project, { manage: true });
  const label = await ProjectLabel.create({ ...req.body, name: req.body.name.trim(), createdBy: req.user._id });
  await recordProjectActivity({ project: label.project, actor: req.user._id, action: 'CREATED', entityType: 'Label', entityId: label._id, title: `Đã tạo Label ${label.name}` });
  send(res, label, 201);
};

const updateLabel = async (req, res) => {
  const label = await getById(ProjectLabel, req.params.id);
  await assertProjectAccess(req.user, label.project, { manage: true });
  const before = label.toObject();
  ['name', 'color', 'description', 'isArchived'].forEach((key) => { if (req.body[key] !== undefined) label[key] = req.body[key]; });
  await label.save();
  await recordProjectActivity({ project: label.project, actor: req.user._id, action: 'UPDATED', entityType: 'Label', entityId: label._id, title: `Đã cập nhật Label ${label.name}`, changes: { before, after: label.toObject() } });
  send(res, label);
};

const deleteLabel = async (req, res) => {
  const label = await getById(ProjectLabel, req.params.id);
  await assertProjectAccess(req.user, label.project, { manage: true });
  await label.deleteOne();
  await recordProjectActivity({ project: label.project, actor: req.user._id, action: 'DELETED', entityType: 'Label', entityId: label._id, title: `Đã xóa Label ${label.name}` });
  send(res, { _id: label._id });
};

const listProjectActivity = async (req, res) => {
  await assertProjectAccess(req.user, req.params.id);
  const result = await list(ProjectActivity, req, {
    baseFilter: { project: req.params.id }, filters: ['action', 'entityType'],
    searchFields: ['title', 'description'], populate: { path: 'actor', select: 'fullName email avatar' },
  });
  send(res, result.data, 200, { pagination: result.pagination });
};

module.exports = { listCycles, createCycle, updateCycle, deleteCycle, listLabels, createLabel, updateLabel, deleteLabel, listProjectActivity };
