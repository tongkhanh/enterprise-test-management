const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const mammoth = require('mammoth');
const WordExtractor = require('word-extractor');
const { PDFParse } = require('pdf-parse');
const { AppError } = require('../utils/http');

const DOCUMENT_ROOT = path.resolve(__dirname, '..', 'storage', 'user-story-documents');
const MAX_EXTRACTED_CHARS = Math.min(Math.max(Number(process.env.DOCUMENT_MAX_EXTRACTED_CHARS) || 500000, 10000), 2000000);
const MIME_TYPES = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

const normalizeText = (value) => String(value || '')
  .replace(/\u0000/g, '')
  .replace(/\r\n?/g, '\n')
  .replace(/[\t\f\v]+/g, ' ')
  .replace(/[ ]{2,}/g, ' ')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const safeOriginalName = (value) => path.basename(String(value || 'document'))
  .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
  .slice(0, 260);

const validateSignature = (extension, buffer) => {
  const isPdf = buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  const isZip = buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && [0x03, 0x05, 0x07].includes(buffer[2]);
  const cfb = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  const isLegacyWord = buffer.length >= 8 && buffer.subarray(0, 8).equals(cfb);
  if (extension === '.pdf' && !isPdf) throw new AppError('Tệp có đuôi PDF nhưng chữ ký tệp không hợp lệ.', 400);
  if (extension === '.docx' && !isZip) throw new AppError('Tệp DOCX không phải gói OpenXML hợp lệ.', 400);
  if (extension === '.doc' && !isLegacyWord) throw new AppError('Tệp DOC legacy không có chữ ký Compound File hợp lệ.', 400);
};

const resolveStoragePath = (relativePath) => {
  const resolved = path.resolve(__dirname, '..', relativePath);
  if (!resolved.startsWith(`${DOCUMENT_ROOT}${path.sep}`)) throw new AppError('Đường dẫn tài liệu không hợp lệ.', 400);
  return resolved;
};

const buildStorageLocation = ({ projectId, storyId, documentId, extension }) => {
  const storedName = `${documentId}${extension}`;
  const relativePath = path.join('storage', 'user-story-documents', String(projectId), String(storyId), storedName);
  return { storedName, relativePath, absolutePath: resolveStoragePath(relativePath) };
};

const persistDocument = async (buffer, absolutePath) => {
  await fsp.mkdir(path.dirname(absolutePath), { recursive: true });
  await fsp.writeFile(absolutePath, buffer, { flag: 'wx' });
};

const extractDocumentText = async ({ buffer, extension }) => {
  let rawText = '';
  let pageCount = null;
  let warnings = [];
  let extractionMethod;

  if (extension === '.pdf') {
    extractionMethod = 'pdf-parse';
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      rawText = result.text;
      pageCount = result.total || result.pages?.length || null;
    } finally {
      await parser.destroy();
    }
  } else if (extension === '.docx') {
    extractionMethod = 'mammoth';
    const result = await mammoth.extractRawText({ buffer });
    rawText = result.value;
    warnings = (result.messages || []).map((item) => item.message).filter(Boolean).slice(0, 20);
  } else if (extension === '.doc') {
    extractionMethod = 'word-extractor';
    const result = await new WordExtractor().extract(buffer);
    rawText = [result.getBody(), result.getFootnotes?.(), result.getAnnotations?.()].filter(Boolean).join('\n\n');
  } else {
    throw new AppError('Định dạng tài liệu chưa được hỗ trợ.', 400);
  }

  const normalized = normalizeText(rawText);
  if (!normalized) throw new AppError('Không trích xuất được văn bản. PDF dạng ảnh cần OCR trước khi tải lên.', 422);
  const wasTruncated = normalized.length > MAX_EXTRACTED_CHARS;
  return {
    text: normalized.slice(0, MAX_EXTRACTED_CHARS),
    originalTextLength: normalized.length,
    pageCount,
    warnings,
    wasTruncated,
    extractionMethod,
  };
};

const removeStoredDocument = async (relativePath) => {
  if (!relativePath) return;
  await fsp.unlink(resolveStoragePath(relativePath)).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
};

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

module.exports = {
  DOCUMENT_ROOT, MIME_TYPES, MAX_EXTRACTED_CHARS,
  normalizeText, safeOriginalName, validateSignature, resolveStoragePath,
  buildStorageLocation, persistDocument, extractDocumentText, removeStoredDocument, sha256,
};
