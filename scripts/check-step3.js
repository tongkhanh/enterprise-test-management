require('dotenv').config();
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const {
  User, Workspace, Project, ProjectMembership, Sprint, TestSuite, TestCase,
  ReviewRequest, BoardItem, TestPlan, TestRun, TestExecution, Notification,
  ProjectActivity,
} = require('../models');
const auth = require('../controllers/authController');
const testDesign = require('../controllers/testDesignController');
const board = require('../controllers/boardController');
const { backfillApprovedBoardItems } = require('../services/boardService');

const invoke = async (handler, req) => {
  let payload; let statusCode = 200;
  const res = { status(value) { statusCode = value; return this; }, json(value) { payload = value; return this; } };
  await handler(req, res);
  return { statusCode, payload };
};

const expectStatus = async (promise, expected) => {
  await assert.rejects(promise, (error) => error.statusCode === expected || error.status === expected);
};

const run = async () => {
  if (!process.env.MONGODB_URI) throw new Error('Thiếu MONGODB_URI.');
  await mongoose.connect(process.env.MONGODB_URI);
  await auth.ensureRoles();
  const suffix = new mongoose.Types.ObjectId().toHexString().slice(-8);
  const passwordHash = await bcrypt.hash('Fixture@2026', 4);
  let workspace; let project; let suite; let cycle; let testCase; let review; let boardItem; let plan; let runItem;
  const users = [];
  try {
    const [adminRole, testerRole, qaRole] = await Promise.all([
      mongoose.model('Role').findOne({ name: 'Admin', workspace: null }),
      mongoose.model('Role').findOne({ name: 'Tester', workspace: null }),
      mongoose.model('Role').findOne({ name: 'QA_Lead', workspace: null }),
    ]);
    assert.ok(adminRole && testerRole && qaRole, 'Các Role chuẩn phải tồn tại.');
    users.push(...await User.create([
      { fullName: 'Phase 3 Admin', email: `p3-admin-${suffix}@example.test`, passwordHash, role: adminRole._id },
      { fullName: 'Phase 3 Tester', email: `p3-tester-${suffix}@example.test`, passwordHash, role: testerRole._id },
      { fullName: 'Phase 3 QA Lead', email: `p3-qa-${suffix}@example.test`, passwordHash, role: qaRole._id },
    ]));
    const [admin, tester, qa] = users;
    await Promise.all(users.map((user) => user.populate('role')));
    workspace = await Workspace.create({ name: `Phase 3 ${suffix}`, slug: `phase-3-${suffix}`, owner: admin._id, maxMembers: 10 });
    await User.updateMany({ _id: { $in: users.map((user) => user._id) } }, { workspace: workspace._id });
    project = await Project.create({ name: `Approval Board ${suffix}`, key: `P${suffix.slice(-6)}`.toUpperCase(), workspace: workspace._id, lead: admin._id, members: users.map((user) => user._id) });
    await ProjectMembership.create([
      { project: project._id, user: admin._id, role: 'Admin' },
      { project: project._id, user: tester._id, role: 'Tester' },
      { project: project._id, user: qa._id, role: 'QA_Lead' },
    ]);
    cycle = await Sprint.create({ name: 'Cycle Phase 3', project: project._id, status: 'Active', startDate: new Date('2026-08-10'), endDate: new Date('2026-08-24'), createdBy: admin._id });
    suite = await TestSuite.create({ name: 'Login regression', project: project._id, createdBy: tester._id });
    const legacyCase = await TestCase.create({ title: 'Legacy approved case', status: 'Approved', testSuite: suite._id, createdBy: tester._id });
    assert.equal(await backfillApprovedBoardItems({ project: project._id }), 1, 'Test Case Approved cũ phải được backfill.');
    assert.ok(await BoardItem.exists({ testCase: legacyCase._id }));
    await Promise.all([BoardItem.deleteOne({ testCase: legacyCase._id }), legacyCase.deleteOne()]);
    testCase = await TestCase.create({
      title: 'Đăng nhập bằng tài khoản hợp lệ', description: 'Người dùng mở được Dashboard.',
      type: 'Automated', status: 'Draft', priority: 'High', testSuite: suite._id,
      createdBy: tester._id, estimatedTime: 5,
      testSteps: [{ stepNumber: 1, action: 'Đăng nhập', expectedResult: 'Dashboard hiển thị' }],
    });

    await expectStatus(invoke(testDesign.submitReview, {
      params: { id: String(testCase._id) }, body: { reviewer: String(tester._id) }, user: tester,
    }), 409);

    const submitted = await invoke(testDesign.submitReview, {
      params: { id: String(testCase._id) }, body: { reviewer: String(qa._id), reviewNote: 'Xin QA kiểm tra.' }, user: tester,
    });
    assert.equal(submitted.statusCode, 201);
    review = submitted.payload.data;
    await expectStatus(invoke(testDesign.decideReview, {
      params: { id: String(review._id) }, body: { decision: 'Approved' }, user: admin,
    }), 403);

    const approved = await invoke(testDesign.decideReview, {
      params: { id: String(review._id) }, body: { decision: 'Approved', reviewNote: 'Đạt tiêu chí.' }, user: qa,
    });
    assert.equal(approved.statusCode, 200);
    assert.equal(approved.payload.data.testCase.status, 'Approved');
    boardItem = await BoardItem.findOne({ testCase: testCase._id });
    assert.ok(boardItem, 'Duyệt phải tự tạo Board Item.');
    assert.equal(boardItem.status, 'Backlog');
    assert.equal(await BoardItem.countDocuments({ testCase: testCase._id }), 1, 'Mỗi Test Case chỉ có một thẻ.');
    await expectStatus(invoke(testDesign.decideReview, {
      params: { id: String(review._id) }, body: { decision: 'Approved' }, user: qa,
    }), 409);

    const backlog = await invoke(board.listBoard, { query: { project: String(project._id), cycle: 'backlog' }, user: tester });
    assert.equal(backlog.payload.data.columns.Backlog.length, 1);
    const todo = await invoke(board.moveBoardItem, { params: { id: String(boardItem._id) }, body: { status: 'Todo', cycle: String(cycle._id) }, user: tester });
    assert.equal(todo.payload.data.status, 'Todo');
    await invoke(board.moveBoardItem, { params: { id: String(boardItem._id) }, body: { status: 'InProgress', cycle: String(cycle._id) }, user: tester });

    const planned = await invoke(board.createPlanFromBoard, {
      body: { project: String(project._id), cycle: String(cycle._id), boardItemIds: [String(boardItem._id)], name: 'Cycle Phase 3 Plan', runName: 'Chrome Staging Run', environment: 'Chrome · Staging' },
      user: admin,
    });
    assert.equal(planned.statusCode, 201);
    plan = planned.payload.data.plan; runItem = planned.payload.data.run;
    assert.equal(await TestExecution.countDocuments({ testRun: runItem._id }), 1);
    await invoke(board.moveBoardItem, { params: { id: String(boardItem._id) }, body: { status: 'InReview', cycle: String(cycle._id) }, user: tester });
    await invoke(board.moveBoardItem, { params: { id: String(boardItem._id) }, body: { status: 'Done', cycle: String(cycle._id) }, user: tester });

    const reloaded = await invoke(board.listBoard, { query: { project: String(project._id), cycle: String(cycle._id) }, user: qa });
    assert.equal(reloaded.payload.data.columns.Done.length, 1, 'Trạng thái phải được đọc lại từ MongoDB.');
    const changed = await invoke(testDesign.updateCase, { params: { id: String(testCase._id) }, body: { description: 'Yêu cầu vừa thay đổi.' }, user: tester });
    assert.equal(changed.payload.data.status, 'NeedsReview');
    assert.equal((await BoardItem.findById(boardItem._id)).reviewState, 'NeedsReview');

    console.log('OK: Tester → QA duyệt → Backlog → Cycle Board → Test Plan/Run → Done; reload và re-review đều bền vững trong MongoDB.');
  } finally {
    if (runItem?._id) await TestExecution.deleteMany({ testRun: runItem._id });
    if (runItem?._id) await TestRun.deleteOne({ _id: runItem._id });
    if (plan?._id) await TestPlan.deleteOne({ _id: plan._id });
    if (project?._id) await Promise.all([
      ProjectActivity.deleteMany({ project: project._id }), BoardItem.deleteMany({ project: project._id }),
      ReviewRequest.deleteMany({ testCase: testCase?._id }), Notification.deleteMany({ $or: [{ recipient: { $in: users.map((user) => user._id) } }, { sender: { $in: users.map((user) => user._id) } }] }),
      TestCase.deleteMany({ testSuite: suite?._id }), TestSuite.deleteMany({ project: project._id }),
      Sprint.deleteMany({ project: project._id }), ProjectMembership.deleteMany({ project: project._id }),
      Project.deleteOne({ _id: project._id }),
    ]);
    if (workspace?._id) await Workspace.deleteOne({ _id: workspace._id });
    if (users.length) await User.deleteMany({ _id: { $in: users.map((user) => user._id) } });
    await mongoose.disconnect();
  }
};

run().catch((error) => { console.error(error); process.exitCode = 1; });
