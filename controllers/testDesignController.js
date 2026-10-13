const mongoose = require('mongoose');
const {
  TestSuite, TestCase, SharedTestData, ReviewRequest, Notification,
  User, Project, ProjectMembership, BoardItem,
} = require('../models');
const { AppError, list, getById, send } = require('../utils/http');
const { addKpiPoints } = require('../services/kpiService');
const { assertProjectAccess, getAccessibleProjectIds } = require('../services/projectAccessService');
const { upsertApprovedBoardItem, markBoardItemNeedsReview } = require('../services/boardService');
const { recordProjectActivity } = require('../services/projectActivityService');
const { getWorkspaceRole } = require('../services/workspaceAccessService');

const accessibleSuiteFilter = async (req) => {
  if (req.query.project) {
    await assertProjectAccess(req.user, req.query.project);
    return { project: req.query.project };
  }
  const projectIds = req.allowedProjectIds || await getAccessibleProjectIds(req.user);
  return projectIds ? { project: { $in: projectIds } } : {};
};

const listSuites = async (req, res) => {
  const suites = await TestSuite.find(await accessibleSuiteFilter(req)).sort('order name').populate('createdBy', 'fullName');
  const nodes = suites.map((suite) => ({ ...suite.toObject(), children: [] }));
  const map = new Map(nodes.map((node) => [String(node._id), node]));
  const tree = [];
  nodes.forEach((node) => {
    const parent = node.parentSuite && map.get(String(node.parentSuite));
    if (parent) parent.children.push(node); else tree.push(node);
  });
  send(res, tree);
};

const createSuite = async (req, res) => {
  if (!req.body.project) throw new AppError('Project là bắt buộc.', 400);
  await assertProjectAccess(req.user, req.body.project);
  if (req.body.parentSuite) {
    const parent = await getById(TestSuite, req.body.parentSuite);
    if (String(parent.project) !== String(req.body.project)) throw new AppError('Suite cha phải thuộc cùng Project.', 400);
  }
  send(res, await TestSuite.create({ ...req.body, createdBy: req.user._id }), 201);
};

const updateSuite = async (req, res) => {
  const suite = await getById(TestSuite, req.params.id);
  await assertProjectAccess(req.user, suite.project);
  req._auditBefore = suite.toObject();
  if (String(req.body.parentSuite || '') === String(suite._id)) throw new AppError('Suite không thể là cha của chính nó.', 400);
  Object.assign(suite, req.body);
  await suite.save();
  send(res, suite);
};

const deleteSuite = async (req, res) => {
  const suite = await getById(TestSuite, req.params.id);
  await assertProjectAccess(req.user, suite.project);
  if (await TestSuite.exists({ parentSuite: suite._id })) throw new AppError('Hãy xóa hoặc di chuyển các Suite con trước.', 409);
  if (await TestCase.exists({ testSuite: suite._id })) throw new AppError('Hãy xóa hoặc di chuyển Test Case trong Suite trước.', 409);
  req._auditBefore = suite.toObject();
  await suite.deleteOne();
  send(res, { _id: suite._id });
};

const listCases = async (req, res) => {
  const suites = await TestSuite.find(await accessibleSuiteFilter(req)).distinct('_id');
  const result = await list(TestCase, req, {
    baseFilter: { testSuite: { $in: suites } },
    filters: ['testSuite', 'userStory', 'status', 'priority', 'type', 'createdBy'],
    searchFields: ['title', 'description', 'tags'],
    populate: [
      { path: 'testSuite', select: 'name project' },
      { path: 'userStory', select: 'title acceptanceCriteria' },
      { path: 'createdBy', select: 'fullName email' },
      { path: 'sharedTestData', select: 'name category data' },
    ],
  });
  send(res, result.data, 200, { pagination: result.pagination });
};

const getCase = async (req, res) => {
  const testCase = await getById(TestCase, req.params.id, [
    { path: 'testSuite', select: 'name project' }, { path: 'userStory', select: 'title acceptanceCriteria' },
    { path: 'sharedTestData' }, { path: 'createdBy', select: 'fullName email' },
  ]);
  await assertProjectAccess(req.user, testCase.testSuite.project);
  send(res, testCase);
};

const createCase = async (req, res) => {
  const suite = await getById(TestSuite, req.body.testSuite);
  await assertProjectAccess(req.user, suite.project);
  const testCase = await TestCase.create({ ...req.body, createdBy: req.user._id });
  await addKpiPoints({ user: req.user._id, project: suite.project, points: 2, reason: `Viết test case: ${testCase.title}`, entityType: 'TestCase', entityId: testCase._id, counters: { testCasesWritten: 1 } });
  send(res, testCase, 201);
};

const updateCase = async (req, res) => {
  const testCase = await getById(TestCase, req.params.id);
  const suite = await getById(TestSuite, testCase.testSuite);
  await assertProjectAccess(req.user, suite.project);
  req._auditBefore = testCase.toObject();
  const editable = [
    'title', 'objective', 'description', 'preconditions', 'postconditions', 'testDesignTechniques', 'priority', 'type', 'estimatedTime',
    'testSteps', 'tags', 'testSuite', 'userStory', 'sharedTestData', 'targetUrl',
    'storyCoverage', 'generatedTestData', 'e2e',
  ];
  editable.forEach((key) => { if (req.body[key] !== undefined) testCase[key] = req.body[key]; });
  if (['Approved', 'Active'].includes(testCase.status)) testCase.status = 'NeedsReview';
  else if (testCase.status === 'Rejected') testCase.status = 'Draft';
  await testCase.save();
  if (testCase.status === 'NeedsReview') await markBoardItemNeedsReview({ testCaseId: testCase._id, actor: req.user._id });
  send(res, testCase);
};

const deleteCase = async (req, res) => {
  const testCase = await getById(TestCase, req.params.id);
  const suite = await getById(TestSuite, testCase.testSuite);
  await assertProjectAccess(req.user, suite.project);
  req._auditBefore = testCase.toObject();
  await Promise.all([ReviewRequest.deleteMany({ testCase: testCase._id }), BoardItem.deleteOne({ testCase: testCase._id }), testCase.deleteOne()]);
  send(res, { _id: testCase._id });
};

const listData = async (req, res) => {
  let baseFilter = {};
  if (req.query.project) { await assertProjectAccess(req.user, req.query.project); baseFilter.project = req.query.project; }
  else baseFilter.project = { $in: req.allowedProjectIds || await getAccessibleProjectIds(req.user) };
  const result = await list(SharedTestData, req, { baseFilter, filters: ['project', 'category', 'isActive'], searchFields: ['name', 'description'], populate: { path: 'createdBy', select: 'fullName' } });
  send(res, result.data, 200, { pagination: result.pagination });
};
const createData = async (req, res) => { await assertProjectAccess(req.user, req.body.project); send(res, await SharedTestData.create({ ...req.body, createdBy: req.user._id }), 201); };
const updateData = async (req, res) => { const item = await getById(SharedTestData, req.params.id); await assertProjectAccess(req.user, item.project); req._auditBefore = item.toObject(); Object.assign(item, req.body); await item.save(); send(res, item); };
const deleteData = async (req, res) => { const item = await getById(SharedTestData, req.params.id); await assertProjectAccess(req.user, item.project); req._auditBefore = item.toObject(); await item.deleteOne(); send(res, { _id: item._id }); };

const listReviews = async (req, res) => {
  const baseFilter = { $or: [{ reviewer: req.user._id }, { requestedBy: req.user._id }] };
  const result = await list(ReviewRequest, req, {
    baseFilter,
    filters: ['status', 'reviewer', 'requestedBy', 'testCase'],
    populate: [
      {
        path: 'testCase',
        select: 'title description preconditions priority status type estimatedTime testSteps storyCoverage generatedTestData targetUrl testSuite userStory createdBy',
        populate: [
          { path: 'testSuite', select: 'name project', populate: { path: 'project', select: 'name key workspace', populate: { path: 'workspace', select: 'name slug' } } },
          { path: 'userStory', select: 'title acceptanceCriteria' },
          { path: 'createdBy', select: 'fullName email' },
        ],
      },
      { path: 'requestedBy reviewer', select: 'fullName email' },
    ],
  });
  const data = result.data.map((item) => item.toObject ? item.toObject() : item);
  const pairs = data.map((review) => ({
    project: review.testCase?.testSuite?.project?._id || review.testCase?.testSuite?.project,
    user: review.requestedBy?._id || review.requestedBy,
  })).filter((pair) => pair.project && pair.user);
  const memberships = pairs.length ? await ProjectMembership.find({
    project: { $in: [...new Set(pairs.map((pair) => String(pair.project)))] },
    user: { $in: [...new Set(pairs.map((pair) => String(pair.user)))] },
    isActive: true,
  }).populate('teams', 'name key').lean() : [];
  const membershipBySender = new Map(memberships.map((membership) => [`${membership.project}:${membership.user}`, membership]));
  const enriched = data.map((review) => {
    const project = review.testCase?.testSuite?.project;
    const sender = review.requestedBy?._id || review.requestedBy;
    const membership = membershipBySender.get(`${project?._id || project}:${sender}`);
    return { ...review, workflowContext: { workspace: project?.workspace || null, project: project || null, teams: membership?.teams || [] } };
  });
  send(res, enriched, 200, { pagination: result.pagination });
};

const submitReview = async (req, res) => {
  const testCase = await getById(TestCase, req.params.id);
  if (!req.body.reviewer) throw new AppError('Vui lòng chọn QA Manager.', 400);
  if (String(req.body.reviewer) === String(req.user._id) || String(req.body.reviewer) === String(testCase.createdBy)) {
    throw new AppError('Người tạo hoặc người gửi không thể tự duyệt Test Case của mình.', 409);
  }
  if (await ReviewRequest.exists({ testCase: testCase._id, status: 'Pending' })) throw new AppError('Test Case đã có yêu cầu duyệt đang chờ.', 409);
  const [suite, reviewer] = await Promise.all([
    TestSuite.findById(testCase.testSuite),
    User.findById(req.body.reviewer).populate('role', 'name'),
  ]);
  if (!suite || !reviewer) throw new AppError('Test Suite hoặc người duyệt không tồn tại.', 404);
  await assertProjectAccess(req.user, suite.project);
  const project = await Project.findById(suite.project);
  const membership = await ProjectMembership.findOne({ project: project._id, user: reviewer._id, isActive: true });
  const reviewerIsProjectMember = membership || project.lead?.equals(reviewer._id) || project.members.some((member) => member.equals(reviewer._id));
  if (!reviewerIsProjectMember) throw new AppError('QA Manager phải là thành viên Project.', 409);
  const reviewerWorkspaceRole = await getWorkspaceRole(reviewer, project.workspace);
  if (!reviewerWorkspaceRole) throw new AppError('Người duyệt phải là thành viên Workspace.', 409);

  const review = await ReviewRequest.create({ testCase: testCase._id, requestedBy: req.user._id, reviewer: reviewer._id, reviewNote: req.body.reviewNote || '' });
  testCase.status = 'NeedsReview';
  await testCase.save();
  await markBoardItemNeedsReview({ testCaseId: testCase._id, actor: req.user._id });
  await Notification.create({ type: 'ReviewRequested', title: 'Yêu cầu duyệt Test Case', message: `${req.user.fullName} yêu cầu bạn duyệt “${testCase.title}”.`, recipient: reviewer._id, sender: req.user._id, relatedEntity: { entityType: 'ReviewRequest', entityId: review._id }, link: `/studio/approvals` });
  send(res, review, 201);
};

const decideReview = async (req, res) => {
  const review = await getById(ReviewRequest, req.params.id);
  if (String(review.reviewer) !== String(req.user._id)) throw new AppError('Yêu cầu này được giao cho QA Manager khác.', 403);
  if (String(review.requestedBy) === String(req.user._id)) throw new AppError('Người gửi không thể tự duyệt Test Case của mình.', 409);
  if (review.status !== 'Pending') throw new AppError('Yêu cầu này đã được xử lý.', 409);
  const approved = req.body.decision === 'Approved';
  if (!approved && req.body.decision !== 'Rejected') throw new AppError('decision phải là Approved hoặc Rejected.', 400);
  if (!approved && !req.body.reviewNote?.trim()) throw new AppError('Lý do từ chối là bắt buộc.', 400);

  const testCase = await getById(TestCase, review.testCase);
  if (String(testCase.createdBy) === String(req.user._id)) throw new AppError('Người tạo không thể tự duyệt Test Case.', 409);
  const suite = await getById(TestSuite, testCase.testSuite);
  await assertProjectAccess(req.user, suite.project);

  const session = await mongoose.startSession();
  let boardItem = null;
  try {
    await session.withTransaction(async () => {
      const currentReview = await ReviewRequest.findOne({ _id: review._id, status: 'Pending', reviewer: req.user._id }).session(session);
      if (!currentReview) throw new AppError('Yêu cầu không còn ở trạng thái Pending.', 409);
      const currentCase = await TestCase.findById(testCase._id).session(session);
      currentReview.status = req.body.decision;
      currentReview.reviewNote = req.body.reviewNote || '';
      currentReview.reviewedAt = new Date();
      currentCase.status = approved ? 'Approved' : 'Rejected';
      await currentReview.save({ session });
      await currentCase.save({ session });
      if (approved) {
        boardItem = await upsertApprovedBoardItem({ testCase: currentCase, project: suite.project, reviewRequest: currentReview, actor: req.user._id, session });
      } else {
        boardItem = await BoardItem.findOne({ testCase: currentCase._id }).session(session);
        if (boardItem) { boardItem.reviewState = 'Rejected'; await boardItem.save({ session }); }
      }
    });
  } finally { await session.endSession(); }

  review.status = req.body.decision;
  review.reviewNote = req.body.reviewNote || '';
  review.reviewedAt = new Date();
  testCase.status = approved ? 'Approved' : 'Rejected';
  if (!approved) await addKpiPoints({ user: review.requestedBy, project: suite.project, points: -5, reason: `Test Case bị từ chối: ${testCase.title}`, entityType: 'TestCase', entityId: testCase._id });
  await Notification.create({ type: 'ReviewCompleted', title: approved ? 'Test Case đã được duyệt' : 'Test Case cần chỉnh sửa', message: req.body.reviewNote || `Kết quả: ${review.status}`, recipient: review.requestedBy, sender: req.user._id, relatedEntity: { entityType: 'ReviewRequest', entityId: review._id }, link: approved ? '/studio/board' : '/studio/ai-generator' });
  await recordProjectActivity({ project: suite.project, actor: req.user._id, action: 'STATUS_CHANGED', entityType: 'TestCase', entityId: testCase._id, title: approved ? `Đã duyệt “${testCase.title}” và đưa vào Backlog` : `Đã từ chối “${testCase.title}”` });
  send(res, { review, testCase, boardItem });
};

module.exports = {
  listSuites, createSuite, updateSuite, deleteSuite,
  listCases, getCase, createCase, updateCase, deleteCase,
  listData, createData, updateData, deleteData,
  listReviews, submitReview, decideReview,
};
