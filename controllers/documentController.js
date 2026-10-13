const path = require('node:path');
const fsp = require('node:fs/promises');
const { UserStory, UserStoryDocument } = require('../models');
const { AppError, assertObjectId, send } = require('../utils/http');
const { assertProjectAccess, roleNameOf } = require('../services/projectAccessService');
const { recordProjectActivity } = require('../services/projectActivityService');
const {
  MIME_TYPES, safeOriginalName, validateSignature, buildStorageLocation,
  persistDocument, extractDocumentText, removeStoredDocument, resolveStoragePath, sha256,
} = require('../services/documentExtractionService');

const getStoryWithAccess = async (req) => {
  assertObjectId(req.params.id, 'User Story ID');
  const story = await UserStory.findById(req.params.id);
  if (!story) throw new AppError('User Story không tồn tại.', 404);
  await assertProjectAccess(req.user, story.project);
  return story;
};

const processDocument = async (document, buffer) => {
  document.status = 'Processing';
  document.errorMessage = null;
  await document.save();
  try {
    const result = await extractDocumentText({ buffer, extension: document.extension });
    document.extractedText = result.text;
    document.textLength = result.originalTextLength;
    document.pageCount = result.pageCount;
    document.extractionWarnings = result.warnings;
    document.wasTruncated = result.wasTruncated;
    document.extractionMethod = result.extractionMethod;
    document.status = 'Ready';
    document.processedAt = new Date();
    await document.save();
    return document;
  } catch (error) {
    document.status = 'Failed';
    document.errorMessage = String(error.message || 'Không thể trích xuất tài liệu.').slice(0, 1000);
    document.processedAt = new Date();
    await document.save();
    throw error;
  }
};

const uploadDocument = async (req, res) => {
  const story = await getStoryWithAccess(req);
  if (!req.file?.buffer?.length) throw new AppError('Vui lòng chọn một tệp PDF, DOC hoặc DOCX.', 400);
  const extension = path.extname(req.file.originalname || '').toLowerCase();
  validateSignature(extension, req.file.buffer);
  const hash = sha256(req.file.buffer);
  const duplicate = await UserStoryDocument.findOne({ userStory: story._id, sha256: hash });
  if (duplicate) throw new AppError(`Tài liệu này đã được tải lên với tên “${duplicate.originalName}”.`, 409);

  const document = new UserStoryDocument({
    userStory: story._id,
    project: story.project,
    originalName: safeOriginalName(req.file.originalname),
    storedName: 'pending',
    storagePath: 'pending',
    mimeType: MIME_TYPES[extension],
    extension,
    size: req.file.size,
    sha256: hash,
    status: 'Uploaded',
    extractionMethod: extension === '.pdf' ? 'pdf-parse' : extension === '.docx' ? 'mammoth' : 'word-extractor',
    uploadedBy: req.user._id,
  });
  const location = buildStorageLocation({ projectId: story.project, storyId: story._id, documentId: document._id, extension });
  document.storedName = location.storedName;
  document.storagePath = location.relativePath;

  let persisted = false;
  try {
    await persistDocument(req.file.buffer, location.absolutePath);
    persisted = true;
    await document.save();
    await processDocument(document, req.file.buffer);
  } catch (error) {
    if (persisted && document.isNew) await removeStoredDocument(location.relativePath).catch(() => null);
    throw error;
  }

  await recordProjectActivity({
    project: story.project, actor: req.user._id, action: 'PROCESSED', entityType: 'Document', entityId: document._id,
    title: `Đã xử lý tài liệu ${document.originalName}`,
    description: `${document.textLength.toLocaleString('vi-VN')} ký tự đã được trích xuất cho User Story “${story.title}”.`,
  });
  req._auditEntityId = document._id;
  const response = document.toObject();
  delete response.storagePath;
  delete response.extractedText;
  send(res, response, 201);
};

const listDocuments = async (req, res) => {
  const story = await getStoryWithAccess(req);
  const documents = await UserStoryDocument.find({ userStory: story._id })
    .sort('-createdAt')
    .populate('uploadedBy', 'fullName email');
  send(res, documents);
};

const getDocument = async (req, includeText = false) => {
  assertObjectId(req.params.documentId, 'Document ID');
  let query = UserStoryDocument.findById(req.params.documentId);
  if (includeText) query = query.select('+extractedText');
  else query = query.select('+storagePath');
  const document = await query;
  if (!document) throw new AppError('Tài liệu không tồn tại.', 404);
  await assertProjectAccess(req.user, document.project);
  return document;
};

const previewDocument = async (req, res) => {
  const document = await getDocument(req, true);
  if (document.status !== 'Ready') throw new AppError('Tài liệu chưa xử lý xong.', 409);
  const limit = Math.min(Math.max(Number(req.query.limit) || 20000, 1000), 100000);
  send(res, {
    _id: document._id, originalName: document.originalName, status: document.status,
    text: document.extractedText.slice(0, limit), textLength: document.textLength,
    previewLength: Math.min(document.extractedText.length, limit),
    previewTruncated: document.extractedText.length > limit || document.wasTruncated,
  });
};

const downloadDocument = async (req, res) => {
  const document = await getDocument(req, false);
  const absolutePath = resolveStoragePath(document.storagePath);
  try { await fsp.access(absolutePath); } catch (_) { throw new AppError('Tệp gốc không còn tồn tại trong kho lưu trữ.', 404); }
  res.setHeader('Content-Type', document.mimeType);
  res.setHeader('Content-Length', document.size);
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(document.originalName)}`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(absolutePath);
};

const reprocessDocument = async (req, res) => {
  const document = await getDocument(req, false);
  if (!['Failed', 'Ready'].includes(document.status)) throw new AppError('Tài liệu đang được xử lý.', 409);
  const buffer = await fsp.readFile(resolveStoragePath(document.storagePath));
  await processDocument(document, buffer);
  await recordProjectActivity({ project: document.project, actor: req.user._id, action: 'PROCESSED', entityType: 'Document', entityId: document._id, title: `Đã xử lý lại tài liệu ${document.originalName}` });
  req._auditEntityId = document._id;
  const response = document.toObject(); delete response.storagePath; delete response.extractedText;
  send(res, response);
};

const deleteDocument = async (req, res) => {
  const document = await getDocument(req, false);
  const role = roleNameOf(req.user);
  const ownsDocument = String(document.uploadedBy) === String(req.user._id);
  const hasManagePermission = req.user.role?.permissions?.includes('requirement:manage') || false;
  if (!ownsDocument && !hasManagePermission) throw new AppError('Bạn chỉ có thể xóa tài liệu do mình tải lên.', 403);
  await removeStoredDocument(document.storagePath);
  await document.deleteOne();
  await recordProjectActivity({ project: document.project, actor: req.user._id, action: 'DELETED', entityType: 'Document', entityId: document._id, title: `Đã xóa tài liệu ${document.originalName}` });
  req._auditEntityId = document._id;
  send(res, { _id: document._id });
};

module.exports = { uploadDocument, listDocuments, previewDocument, downloadDocument, reprocessDocument, deleteDocument };
