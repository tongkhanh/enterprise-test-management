const { Bug, BugHistory, BugRetest, Notification, Project } = require('../models');
const { AppError, list, getById, send } = require('../utils/http');
const { addKpiPoints } = require('../services/kpiService');
const { getAccessibleProjectIds } = require('../services/projectAccessService');
const { assertProjectAccess } = require('../services/projectAccessService');
const { createJiraBug } = require('../services/jiraService');

const listBugs = async (req, res) => {
  const accessibleProjects = req.allowedProjectIds || await getAccessibleProjectIds(req.user);
  if (req.query.project && !accessibleProjects.some((id) => String(id) === String(req.query.project))) throw new AppError('Bạn không thuộc Project này.', 403);
  const result = await list(Bug, req, { baseFilter: { project: { $in: accessibleProjects } }, filters: ['project', 'status', 'severity', 'priority', 'assignedTo', 'reportedBy', 'sprint', 'release'], searchFields: ['title', 'description', 'stepsToReproduce', 'tags'], populate: [{ path: 'reportedBy assignedTo', select: 'fullName email' }, { path: 'project', select: 'name key' }] });
  send(res, result.data, 200, { pagination: result.pagination });
};

const getBug = async (req, res) => {
  const bug = await getById(Bug, req.params.id, [{ path: 'reportedBy assignedTo', select: 'fullName email' }, { path: 'project sprint release userStory', select: 'name title version' }]);
  const [history, retests] = await Promise.all([
    BugHistory.find({ bug: bug._id }).sort('changeDate').populate('changedBy', 'fullName'),
    BugRetest.find({ bug: bug._id }).sort('retestRound').populate('retester', 'fullName'),
  ]);
  send(res, { bug, history, retests });
};

const createBug = async (req, res) => {
  const bug = await Bug.create({ ...req.body, reportedBy: req.user._id });
  const severityPoints = { Critical: 10, Major: 5, Minor: 2, Trivial: 1 };
  const severityKey = bug.severity.toLowerCase();
  await addKpiPoints({ user: req.user._id, project: bug.project, points: severityPoints[bug.severity], reason: `Phát hiện bug ${bug.severity}: ${bug.title}`, entityType: 'Bug', entityId: bug._id, counters: { 'bugsFound.total': 1, [`bugsFound.${severityKey}`]: 1 } });
  if (bug.assignedTo) await Notification.create({ type: 'BugAssigned', title: 'Bạn được giao xử lý bug', message: `${req.user.fullName} đã giao bug “${bug.title}” cho bạn.`, recipient: bug.assignedTo, sender: req.user._id, relatedEntity: { entityType: 'Bug', entityId: bug._id }, link: `/bug-track.html?bug=${bug._id}` });

  let duplicateCandidates = [];
  const aiService = require('../services/aiService');
  if (aiService.isEmbeddingConfigured()) {
    try {
      duplicateCandidates = await aiService.indexBugAndFindDuplicates(bug);
    } catch (error) {
      // AI không được phép làm thất bại luồng báo bug chính.
      console.warn('Không thể lập chỉ mục vector cho bug:', error.message);
    }
  }
  send(res, { bug, duplicateCandidates }, 201);
};

const updateBug = async (req, res) => {
  const bug = await getById(Bug, req.params.id);
  req._auditBefore = bug.toObject();
  const previousStatus = bug.status;
  const previousAssignee = bug.assignedTo && String(bug.assignedTo);
  const editable = ['title', 'description', 'stepsToReproduce', 'severity', 'priority', 'status', 'environment', 'browser', 'os', 'attachments', 'tags', 'assignedTo', 'userStory', 'sprint', 'release'];
  editable.forEach((key) => { if (req.body[key] !== undefined) bug[key] = req.body[key]; });
  await bug.save();
  if (previousStatus !== bug.status) {
    const last = await BugHistory.findOne({ bug: bug._id }).sort('-changeDate');
    const since = last?.changeDate || bug.createdAt;
    await BugHistory.create({ bug: bug._id, fromStatus: previousStatus, toStatus: bug.status, changedBy: req.user._id, comment: req.body.statusComment || '', timeInPreviousStatus: Math.max(0, Math.round((Date.now() - new Date(since).getTime()) / 60000)) });
    const recipients = [bug.reportedBy, bug.assignedTo].filter(Boolean).map(String).filter((id) => id !== String(req.user._id));
    if (recipients.length) await Notification.insertMany([...new Set(recipients)].map((recipient) => ({ type: 'BugStatusChanged', title: 'Trạng thái bug thay đổi', message: `“${bug.title}”: ${previousStatus} → ${bug.status}`, recipient, sender: req.user._id, relatedEntity: { entityType: 'Bug', entityId: bug._id }, link: `/bug-track.html?bug=${bug._id}` })));
  }
  if (bug.assignedTo && String(bug.assignedTo) !== previousAssignee && String(bug.assignedTo) !== String(req.user._id)) {
    await Notification.create({ type: 'BugAssigned', title: 'Bạn được giao xử lý bug', message: `Bug “${bug.title}” đã được giao cho bạn.`, recipient: bug.assignedTo, sender: req.user._id, relatedEntity: { entityType: 'Bug', entityId: bug._id }, link: `/bug-track.html?bug=${bug._id}` });
  }
  if (bug.externalIssue?.provider === 'Jira') await require('../services/integrationSyncService').enqueueJiraBugSync({ bugId: bug._id, comment: req.body.statusComment, userId: req.user._id });
  send(res, bug);
};

const deleteBug = async (req, res) => {
  const bug = await getById(Bug, req.params.id); req._auditBefore = bug.toObject();
  await Promise.all([BugHistory.deleteMany({ bug: bug._id }), BugRetest.deleteMany({ bug: bug._id }), bug.deleteOne()]);
  send(res, { _id: bug._id });
};

const createRetest = async (req, res) => {
  const bug = await getById(Bug, req.params.id);
  if (bug.status !== 'Resolved') throw new AppError('Chỉ có thể retest sau khi người xử lý chuyển bug sang Resolved.', 409);
  const lastRetest = await BugRetest.findOne({ bug: bug._id }).sort('-retestRound');
  const retest = await BugRetest.create({ bug: bug._id, retester: req.user._id, result: req.body.result, notes: req.body.notes || '', evidence: req.body.evidence || [], retestRound: (lastRetest?.retestRound || 0) + 1 });
  const oldStatus = bug.status; bug.status = retest.result === 'Passed' ? 'Verified' : 'Reopened'; await bug.save();
  await BugHistory.create({ bug: bug._id, fromStatus: oldStatus, toStatus: bug.status, changedBy: req.user._id, comment: `Retest vòng ${retest.retestRound}: ${retest.result}` });
  await addKpiPoints({ user: req.user._id, project: bug.project, points: 1, reason: `Retest bug: ${bug.title}`, entityType: 'BugRetest', entityId: retest._id, counters: { retestsDone: 1 } });
  send(res, { retest, bug }, 201);
};

const decideBug = async (req, res) => {
  const bug = await Bug.findById(req.params.id);
  if (!bug) throw new AppError('Bug không tồn tại.', 404);
  await assertProjectAccess(req.user, bug.project, { manage: true });
  if (!['Approved', 'Rejected'].includes(req.body.decision)) throw new AppError('decision không hợp lệ.', 400);
  if (bug.approvalStatus !== 'PendingApproval') throw new AppError('Bug không ở trạng thái chờ duyệt.', 409);
  if (req.body.decision === 'Rejected' && !String(req.body.reviewNote || '').trim()) throw new AppError('Cần nhập lý do từ chối.', 400);
  bug.approvalStatus = req.body.decision; bug.reviewNote = String(req.body.reviewNote || '').trim().slice(0, 2000);
  bug.approvedBy = req.body.decision === 'Approved' ? req.user._id : null; bug.approvedAt = req.body.decision === 'Approved' ? new Date() : null;
  if (req.body.decision === 'Approved' && (bug.jiraRequested || req.body.createJira) && !bug.externalIssue?.key) {
    const issue = await createJiraBug({ summary: bug.title, rootCause: bug.rootCause?.summary, confidence: bug.rootCause?.confidence, severity: bug.severity, priority: bug.priority, environment: bug.environment, steps: bug.stepsToReproduce, evidence: bug.rootCause?.evidence || [] });
    bug.externalIssue = { provider: 'Jira', id: issue.id, key: issue.key, url: issue.url, syncedAt: issue.syncedAt, attachmentWarnings: issue.warnings || [] };
  }
  await bug.save({ validateBeforeSave: false });
  send(res, bug);
};

module.exports = { listBugs, getBug, createBug, updateBug, deleteBug, createRetest, decideBug };
