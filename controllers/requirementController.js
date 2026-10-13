const { User, UserStory, UserStoryDocument, Comment, DesignMockup, Notification, ProjectMembership } = require('../models');
const { AppError, list, getById, send } = require('../utils/http');
const { getAccessibleProjectIds, assertProjectAccess } = require('../services/projectAccessService');
const { removeStoredDocument } = require('../services/documentExtractionService');

const listStories = async (req, res) => {
  let baseFilter = {};
  if (req.query.project) {
    await assertProjectAccess(req.user, req.query.project);
    baseFilter.project = req.query.project;
  } else {
    const projectIds = req.allowedProjectIds || await getAccessibleProjectIds(req.user);
    if (projectIds) baseFilter.project = { $in: projectIds };
  }
  const result = await list(UserStory, req, {
    baseFilter,
    filters: ['sprint', 'status', 'priority', 'assignee', 'approvalStatus'],
    searchFields: ['title', 'description'],
    populate: [{ path: 'assignee', select: 'fullName email' }, { path: 'createdBy', select: 'fullName' }, { path: 'sprint', select: 'name' }, { path: 'project', select: 'name key workspace', populate: { path: 'workspace', select: 'name slug' } }],
  });
  const data = result.data.map((item) => item.toObject ? item.toObject() : item);
  const memberships = data.length ? await ProjectMembership.find({
    project: { $in: [...new Set(data.map((story) => String(story.project?._id || story.project)).filter(Boolean))] },
    user: { $in: [...new Set(data.map((story) => String(story.createdBy?._id || story.createdBy)).filter(Boolean))] },
    isActive: true,
  }).populate('teams', 'name key').lean() : [];
  const membershipByCreator = new Map(memberships.map((membership) => [`${membership.project}:${membership.user}`, membership]));
  const enriched = data.map((story) => {
    const project = story.project;
    const creator = story.createdBy?._id || story.createdBy;
    const membership = membershipByCreator.get(`${project?._id || project}:${creator}`);
    return { ...story, workflowContext: { workspace: project?.workspace || null, project: project || null, teams: membership?.teams || [] } };
  });
  send(res, enriched, 200, { pagination: result.pagination });
};

const getStory = async (req, res) => {
  const story = await getById(UserStory, req.params.id, [
    { path: 'assignee', select: 'fullName email' }, { path: 'createdBy', select: 'fullName' }, { path: 'sprint', select: 'name' },
  ]);
  await assertProjectAccess(req.user, story.project);
  const [comments, mockups] = await Promise.all([
    Comment.find({ entityType: 'UserStory', entityId: story._id }).sort('createdAt').populate('author mentions', 'fullName email'),
    DesignMockup.find({ userStory: story._id }).sort('-createdAt').populate('uploadedBy', 'fullName'),
  ]);
  const nodes = comments.map((comment) => ({ ...comment.toObject(), replies: [] }));
  const map = new Map(nodes.map((node) => [String(node._id), node]));
  const tree = [];
  nodes.forEach((node) => {
    const parent = node.parentComment && map.get(String(node.parentComment));
    if (parent) parent.replies.push(node); else tree.push(node);
  });
  send(res, { story, comments: tree, mockups });
};

const createStory = async (req, res) => {
  if (!req.body.project) throw new AppError('Project là bắt buộc.', 400);
  await assertProjectAccess(req.user, req.body.project);
  send(res, await UserStory.create({ ...req.body, createdBy: req.user._id }), 201);
};

const updateStory = async (req, res) => {
  const story = await getById(UserStory, req.params.id);
  await assertProjectAccess(req.user, story.project);
  const isE2EAiStory = story.source === 'AI' && story.e2e?.useCase;
  if (isE2EAiStory && !['Draft', 'Rejected', 'Approved'].includes(story.approvalStatus)) throw new AppError('User Story E2E đang chờ duyệt nên không thể chỉnh sửa.', 409);
  // A change to an approved AI proposal must restart maker-checker review.
  // Keep the same artifact for traceability, but remove the old decision.
  if (isE2EAiStory && story.approvalStatus === 'Approved') {
    story.approvalStatus = 'Draft';
    story.status = 'Backlog';
    story.reviewNote = '';
    story.approvedBy = null;
    story.approvedAt = null;
  }
  req._auditBefore = story.toObject();
  const editable = ['title', 'description', 'acceptanceCriteria', 'storyPoints', 'priority', 'status', 'labels', 'sprint', 'assignee', 'aiSuggestion', 'source', 'repositorySource', 'e2e'];
  editable.forEach((key) => { if (req.body[key] !== undefined) story[key] = req.body[key]; });
  await story.save();
  send(res, story);
};

const submitApproval = async (req, res) => {
  const story = await getById(UserStory, req.params.id);
  await assertProjectAccess(req.user, story.project);
  const isE2EAiStory = story.source === 'AI' && story.e2e?.useCase;
  if (isE2EAiStory && !['Draft', 'Rejected'].includes(story.approvalStatus)) throw new AppError('User Story E2E này không ở trạng thái bản nháp để gửi duyệt.', 409);
  if (!story.title?.trim() || !story.description?.trim() || !story.acceptanceCriteria?.length) throw new AppError('User Story phải có tiêu đề, mô tả và Acceptance Criteria trước khi gửi duyệt.', 400);
  story.approvalStatus = 'PendingApproval';
  story.reviewNote = '';
  await story.save();
  send(res, story);
};

const decideApproval = async (req, res) => {
  const story = await getById(UserStory, req.params.id);
  await assertProjectAccess(req.user, story.project);
  const decision = req.body.decision;
  const isE2EAiStory = story.source === 'AI' && story.e2e?.useCase;
  if (isE2EAiStory && String(story.createdBy) === String(req.user._id)) throw new AppError('Người tạo User Story E2E không thể tự duyệt bản nháp của mình.', 403);
  if (!['Approved', 'Rejected'].includes(decision)) throw new AppError('decision phải là Approved hoặc Rejected.', 400);
  if (decision === 'Approved' && story.approvalStatus !== 'PendingApproval') throw new AppError('Chỉ User Story đang chờ duyệt mới được Approved.', 409);
  if (decision === 'Rejected' && !String(req.body.reviewNote || '').trim()) throw new AppError('Cần nhập lý do từ chối User Story.', 400);
  story.approvalStatus = decision;
  story.reviewNote = String(req.body.reviewNote || '').trim().slice(0, 2000);
  story.approvedBy = decision === 'Approved' ? req.user._id : null;
  story.approvedAt = decision === 'Approved' ? new Date() : null;
  // Story Approved là điều kiện để sinh Test Case trong flow chính thức.
  if (decision === 'Approved') story.status = 'Ready';
  await story.save();
  send(res, story);
};

const deleteStory = async (req, res) => {
  const story = await getById(UserStory, req.params.id);
  await assertProjectAccess(req.user, story.project);
  req._auditBefore = story.toObject();
  const documents = await UserStoryDocument.find({ userStory: story._id }).select('+storagePath');
  await Promise.all([
    Comment.deleteMany({ entityType: 'UserStory', entityId: story._id }),
    DesignMockup.deleteMany({ userStory: story._id }),
    UserStoryDocument.deleteMany({ userStory: story._id }),
    ...documents.map((document) => removeStoredDocument(document.storagePath)),
    story.deleteOne(),
  ]);
  send(res, { _id: story._id });
};

const resolveMentions = async (content, explicitIds = []) => {
  const tokens = [...content.matchAll(/@([\w.+-]+)/g)].map((match) => match[1].toLowerCase());
  const users = tokens.length ? await User.find({ $or: tokens.flatMap((token) => [
    { email: new RegExp(`^${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}@`, 'i') },
    { fullName: new RegExp(`^${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i') },
  ]) }).select('_id') : [];
  return [...new Set([...explicitIds.map(String), ...users.map((user) => String(user._id))])];
};

const addComment = async (req, res) => {
  const story = await getById(UserStory, req.params.id);
  if (!req.body.content?.trim()) throw new AppError('Nội dung bình luận là bắt buộc.', 400);
  if (req.body.parentComment) {
    const parent = await Comment.findOne({ _id: req.body.parentComment, entityType: 'UserStory', entityId: story._id });
    if (!parent) throw new AppError('Bình luận cha không thuộc User Story này.', 400);
  }
  const mentions = await resolveMentions(req.body.content, req.body.mentions || []);
  const comment = await Comment.create({
    content: req.body.content,
    entityType: 'UserStory', entityId: story._id,
    parentComment: req.body.parentComment || null,
    attachments: req.body.attachments || [], mentions, author: req.user._id,
  });
  const recipients = mentions.filter((id) => id !== String(req.user._id));
  if (recipients.length) await Notification.insertMany(recipients.map((recipient) => ({
    type: 'MentionedInComment', title: 'Bạn được nhắc đến', message: `${req.user.fullName} đã nhắc đến bạn trong “${story.title}”.`,
    recipient, sender: req.user._id, link: `/agile-req.html?story=${story._id}`,
    relatedEntity: { entityType: 'Comment', entityId: comment._id },
  })));
  await comment.populate('author mentions', 'fullName email');
  send(res, comment, 201);
};

const updateComment = async (req, res) => {
  const comment = await getById(Comment, req.params.commentId);
  if (!comment.author.equals(req.user._id) && !req.user.role?.permissions?.includes('requirement:manage')) throw new AppError('Bạn không thể sửa bình luận của người khác.', 403);
  comment.content = req.body.content || comment.content;
  comment.attachments = req.body.attachments || comment.attachments;
  comment.mentions = await resolveMentions(comment.content, req.body.mentions || []);
  comment.isEdited = true;
  await comment.save();
  send(res, comment);
};

const deleteComment = async (req, res) => {
  const comment = await getById(Comment, req.params.commentId);
  if (!comment.author.equals(req.user._id) && !req.user.role?.permissions?.includes('requirement:manage')) throw new AppError('Bạn không thể xóa bình luận của người khác.', 403);
  await Comment.deleteMany({ $or: [{ _id: comment._id }, { parentComment: comment._id }] });
  send(res, { _id: comment._id });
};

const listMockups = async (req, res) => {
  const projectIds = req.allowedProjectIds || await getAccessibleProjectIds(req.user);
  const result = await list(DesignMockup, req, { baseFilter: { project: { $in: projectIds } }, filters: ['project', 'userStory', 'status', 'type'], searchFields: ['title', 'description'], populate: [{ path: 'userStory', select: 'title' }, { path: 'uploadedBy', select: 'fullName' }] });
  send(res, result.data, 200, { pagination: result.pagination });
};

const createMockup = async (req, res) => { await assertProjectAccess(req.user, req.body.project); send(res, await DesignMockup.create({ ...req.body, uploadedBy: req.user._id }), 201); };

const updateMockup = async (req, res) => {
  const mockup = await getById(DesignMockup, req.params.id);
  await assertProjectAccess(req.user, mockup.project);
  req._auditBefore = mockup.toObject();
  Object.assign(mockup, req.body);
  await mockup.save();
  send(res, mockup);
};

const deleteMockup = async (req, res) => {
  const mockup = await getById(DesignMockup, req.params.id);
  await assertProjectAccess(req.user, mockup.project);
  req._auditBefore = mockup.toObject();
  await mockup.deleteOne();
  send(res, { _id: mockup._id });
};

module.exports = { listStories, getStory, createStory, updateStory, submitApproval, decideApproval, deleteStory, addComment, updateComment, deleteComment, listMockups, createMockup, updateMockup, deleteMockup };
