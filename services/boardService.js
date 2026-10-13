const { BoardItem, ReviewRequest, TestCase } = require('../models');

const nextPosition = async ({ project, cycle = null, status = 'Backlog', session }) => {
  const latest = await BoardItem.findOne({ project, cycle, status, isArchived: false })
    .sort('-position')
    .select('position')
    .session(session || null);
  return (latest?.position || 0) + 1000;
};

const upsertApprovedBoardItem = async ({ testCase, project, reviewRequest, actor, session }) => {
  const existing = await BoardItem.findOne({ testCase: testCase._id }).session(session || null);
  if (existing) {
    existing.reviewRequest = reviewRequest?._id || existing.reviewRequest;
    existing.reviewState = 'Approved';
    existing.isArchived = false;
    existing.archivedReason = null;
    if (!existing.createdBy) existing.createdBy = actor;
    await existing.save({ session });
    return existing;
  }
  const position = await nextPosition({ project, cycle: null, status: 'Backlog', session });
  const [item] = await BoardItem.create([{
    project, cycle: null, testCase: testCase._id, reviewRequest: reviewRequest?._id || null,
    status: 'Backlog', reviewState: 'Approved', position,
    estimate: testCase.estimatedTime || 0, createdBy: actor, lastMovedBy: actor,
    statusHistory: [{ from: null, to: 'Backlog', movedBy: actor, movedAt: new Date() }],
  }], { session });
  return item;
};

const markBoardItemNeedsReview = async ({ testCaseId, actor, session }) => {
  const item = await BoardItem.findOne({ testCase: testCaseId }).session(session || null);
  if (!item) return null;
  item.reviewState = 'NeedsReview';
  item.lastMovedBy = actor;
  await item.save({ session });
  return item;
};

const backfillApprovedBoardItems = async ({ project = null } = {}) => {
  const approvedCases = await TestCase.find({ status: { $in: ['Approved', 'Active'] } })
    .select('testSuite createdBy estimatedTime status')
    .populate({ path: 'testSuite', select: 'project' });
  if (!approvedCases.length) return 0;
  const existingIds = new Set((await BoardItem.find({ testCase: { $in: approvedCases.map((item) => item._id) } }).distinct('testCase')).map(String));
  let created = 0;
  for (const testCase of approvedCases) {
    if (existingIds.has(String(testCase._id)) || !testCase.testSuite?.project || !testCase.createdBy) continue;
    if (project && String(testCase.testSuite.project) !== String(project)) continue;
    const reviewRequest = await ReviewRequest.findOne({ testCase: testCase._id, status: 'Approved' }).sort('-reviewedAt');
    try {
      await upsertApprovedBoardItem({
        testCase,
        project: testCase.testSuite.project,
        reviewRequest,
        actor: reviewRequest?.reviewer || testCase.createdBy,
      });
      created += 1;
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
  }
  return created;
};

module.exports = { nextPosition, upsertApprovedBoardItem, markBoardItemNeedsReview, backfillApprovedBoardItems };
