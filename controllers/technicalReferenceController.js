const path = require('node:path');
const crypto = require('node:crypto');
const { TechnicalReference } = require('../models');
const { AppError, assertObjectId, send } = require('../utils/http');
const { assertProjectAccess } = require('../services/projectAccessService');
const { extractDocumentText, normalizeText, persistDocument, resolveStoragePath, safeOriginalName, sha256, validateSignature } = require('../services/documentExtractionService');

const textExtensions = new Set(['.json', '.yaml', '.yml', '.txt', '.md', '.sql', '.csv']);
const extract = async (file, extension) => {
  if (textExtensions.has(extension)) return { text: normalizeText(file.buffer.toString('utf8')), extractionMethod: 'plain-text' };
  if (['.png', '.jpg', '.jpeg', '.webp'].includes(extension)) return { text: '', extractionMethod: 'image-metadata' };
  return extractDocumentText({ buffer: file.buffer, extension });
};
const serialize = (item) => ({
  _id: item._id,
  type: item.type,
  title: item.title,
  version: item.version,
  sourceMode: item.sourceMode,
  url: item.url,
  fileName: item.originalFilename,
  notes: item.contentExcerpt,
  checksum: item.checksum,
  createdAt: item.createdAt,
});

const list = async (req, res) => {
  assertObjectId(req.query.project, 'Project ID');
  await assertProjectAccess(req.user, req.query.project);
  const filter = { project: req.query.project };
  if (req.query.systemProfile) filter.systemProfile = req.query.systemProfile;
  const items = await TechnicalReference.find(filter).sort('-createdAt').limit(100);
  send(res, items.map(serialize));
};

const upload = async (req, res) => {
  if (!req.file) throw new AppError('Hãy chọn tài liệu kỹ thuật cần tải lên.', 400);
  assertObjectId(req.body.project, 'Project ID');
  await assertProjectAccess(req.user, req.body.project);
  const type = String(req.body.type || '').trim().slice(0, 80);
  if (!type) throw new AppError('Loại tài liệu là bắt buộc.', 400);
  const extension = path.extname(req.file.originalname || '').toLowerCase();
  if (['.pdf', '.doc', '.docx'].includes(extension)) validateSignature(extension, req.file.buffer);
  const extracted = await extract(req.file, extension);
  const originalFilename = safeOriginalName(req.file.originalname);
  const storedName = `${Date.now()}-${crypto.randomUUID()}${extension}`;
  const relativePath = path.join('storage', 'user-story-documents', 'technical-references', String(req.body.project), storedName);
  await persistDocument(req.file.buffer, resolveStoragePath(relativePath));
  const item = await TechnicalReference.create({
    project: req.body.project,
    systemProfile: req.body.systemProfile || null,
    type,
    title: String(req.body.title || originalFilename).trim().slice(0, 300),
    version: String(req.body.version || '').trim().slice(0, 100),
    sourceMode: 'File',
    originalFilename,
    mimeType: req.file.mimetype,
    size: req.file.size,
    checksum: sha256(req.file.buffer),
    storagePath: relativePath,
    extractionMethod: extracted.extractionMethod,
    contentExcerpt: String(extracted.text || '').slice(0, 20000),
    createdBy: req.user._id,
  });
  send(res, serialize(item), 201);
};

const createLink = async (req, res) => {
  assertObjectId(req.body.project, 'Project ID');
  await assertProjectAccess(req.user, req.body.project);
  const type = String(req.body.type || '').trim().slice(0, 80);
  if (!type) throw new AppError('Loại tài liệu là bắt buộc.', 400);
  let parsed;
  try { parsed = new URL(String(req.body.url || '').trim()); } catch { throw new AppError('Liên kết tài liệu không hợp lệ.', 400); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new AppError('Chỉ chấp nhận URL http(s) không chứa thông tin đăng nhập.', 400);
  const item = await TechnicalReference.create({
    project: req.body.project,
    systemProfile: req.body.systemProfile || null,
    type,
    title: String(req.body.title || parsed.hostname).trim().slice(0, 300),
    version: String(req.body.version || '').trim().slice(0, 100),
    sourceMode: 'URL',
    url: parsed.toString(),
    createdBy: req.user._id,
  });
  send(res, serialize(item), 201);
};

module.exports = { list, upload, createLink };
