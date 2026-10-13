const mongoose = require('mongoose');
const { UserStoryDocument } = require('../models');
const { AppError } = require('../utils/http');

const MAX_CONTEXT_CHARS = Math.min(Math.max(Number(process.env.AI_DOCUMENT_CONTEXT_MAX_CHARS) || 50000, 5000), 200000);

const getDocumentContext = async ({ storyId, documentIds }) => {
  const explicitSelection = Array.isArray(documentIds);
  const ids = explicitSelection ? [...new Set(documentIds.map(String).filter(Boolean))] : null;
  if (ids?.some((id) => !mongoose.isValidObjectId(id))) throw new AppError('Danh sách documentIds có ID không hợp lệ.', 400);
  if (ids?.length === 0) return { documents: [], contextText: '', totalCharacters: 0, truncated: false };

  const filter = { userStory: storyId };
  if (ids) filter._id = { $in: ids };
  const documents = await UserStoryDocument.find(filter).select('+extractedText').sort('createdAt');
  if (ids && documents.length !== ids.length) throw new AppError('Có tài liệu không thuộc User Story đã chọn.', 409);
  const notReady = documents.filter((document) => document.status !== 'Ready');
  if (notReady.length) throw new AppError(`Tài liệu “${notReady[0].originalName}” chưa xử lý xong.`, 409);

  let remaining = MAX_CONTEXT_CHARS;
  const sections = [];
  for (const document of documents) {
    if (remaining <= 0) break;
    const heading = `### ${document.originalName}\n`;
    const available = Math.max(0, remaining - heading.length);
    const text = document.extractedText.slice(0, available);
    sections.push(`${heading}${text}`);
    remaining -= heading.length + text.length;
  }
  const totalCharacters = documents.reduce((sum, document) => sum + document.extractedText.length, 0);
  return {
    documents: documents.map((document) => ({
      id: document._id, originalName: document.originalName, extension: document.extension,
      textLength: document.textLength, extractionMethod: document.extractionMethod,
    })),
    contextText: sections.join('\n\n'),
    totalCharacters,
    truncated: totalCharacters > MAX_CONTEXT_CHARS,
  };
};

module.exports = { getDocumentContext, MAX_CONTEXT_CHARS };
