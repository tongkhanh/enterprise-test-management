const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const mammoth = require('mammoth');
const WordExtractor = require('word-extractor');
const ExcelJS = require('exceljs');
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

// Classification is deliberately evidence-based. It prevents a structured
// Use Case document from being forced into the Requirement schema merely
// because it was uploaded through the wrong endpoint.
const detectBusinessDocumentType = (value) => {
  const content = normalizeText(value);
  const useCaseCodes = [...new Set(content.match(/\bUC-[A-Z0-9-]*\d+\b/gi) || [])];
  const useCaseLabels = [
    /(?:^|\n)Tác nhân(?:\n|$)/i,
    /(?:^|\n)Tiền điều kiện(?:\n|$)/i,
    /(?:^|\n)Luồng chính(?:\n|$)/i,
    /(?:^|\n)Luồng (?:thay thế|ngoại lệ|thay thế \/ lỗi)(?:\n|$)/i,
    /(?:^|\n)Hậu điều kiện(?:\n|$)/i,
  ].filter((pattern) => pattern.test(content)).length;
  if (useCaseCodes.length >= 2 && useCaseLabels >= 4) {
    return { type: 'UseCase', confidence: 'High', evidence: { useCaseCodes: useCaseCodes.length, useCaseLabels } };
  }
  const storySignals = (content.match(/\bAs an?\b[\s\S]{0,300}\bI want\b[\s\S]{0,300}\bso that\b/gi) || []).length;
  if (storySignals >= 2) return { type: 'UserStory', confidence: 'High', evidence: { storySignals } };
  return { type: 'Unknown', confidence: 'Low', evidence: {} };
};

// Preserve one complete detailed Use Case per AI input unit. Catalog rows are
// ignored because they do not contain the standard specification labels.
const splitDetailedUseCaseSections = (value) => {
  const content = normalizeText(value);
  const heading = /^(UC-[A-Z0-9-]*\d+)\s+([^\n]+)$/gmi;
  const matches = [...content.matchAll(heading)];
  const sharedSectionStart = content.search(/^5\.\s*Quy tắc[^\n]*$/mi);
  const labels = /(?:^|\n)(?:Tác nhân|Tiền điều kiện|Luồng chính|Luồng thay thế(?: \/ lỗi)?|Luồng ngoại lệ|Hậu điều kiện|Bằng chứng mã nguồn)(?:\n|$)/gmi;
  const sections = [];
  for (let index = 0; index < matches.length; index += 1) {
    const start = matches[index].index;
    const nextHeading = matches[index + 1]?.index ?? content.length;
    const end = sharedSectionStart > start ? Math.min(nextHeading, sharedSectionStart) : nextHeading;
    const section = content.slice(start, end).trim();
    const labelCount = (section.match(labels) || []).length;
    if (labelCount >= 4) sections.push(section);
  }
  return sections;
};

const USE_CASE_SECTION_LABELS = new Map([
  ['tác nhân', 'actor'],
  ['tiền điều kiện', 'preconditions'],
  ['luồng chính', 'mainFlow'],
  ['luồng thay thế / lỗi', 'alternateFlows'],
  ['luồng thay thế', 'alternateFlows'],
  ['luồng ngoại lệ', 'exceptionFlows'],
  ['hậu điều kiện', 'postconditions'],
  ['bằng chứng mã nguồn', 'dependencies'],
]);

const splitStructuredItems = (value) => normalizeText(value)
  .split(/\s*;\s*|\n+/)
  .map((item) => item.trim())
  .filter(Boolean);

// Parse the deterministic table fields before asking AI to normalize prose.
// These values are later used as lossless evidence so an omitted JSON field
// cannot silently discard content that was explicitly present in the DOCX.
const parseDetailedUseCaseSection = (value) => {
  const lines = normalizeText(value).split('\n').map((line) => line.trim()).filter(Boolean);
  const heading = lines[0]?.match(/^(UC-[A-Z0-9-]*\d+)\s+(.+)$/i);
  const fields = {};
  let current = '';
  for (const line of lines.slice(1)) {
    const key = USE_CASE_SECTION_LABELS.get(line.toLocaleLowerCase('vi'));
    if (key) {
      current = key;
      if (!fields[current]) fields[current] = [];
      continue;
    }
    if (current) fields[current].push(line);
  }
  const joined = (key) => normalizeText((fields[key] || []).join('\n'));
  return {
    code: heading?.[1] || '',
    name: heading?.[2] || '',
    actor: joined('actor'),
    preconditions: splitStructuredItems(joined('preconditions')),
    mainFlowSource: joined('mainFlow'),
    alternateFlows: splitStructuredItems(joined('alternateFlows')),
    exceptionFlows: splitStructuredItems(joined('exceptionFlows')),
    postconditions: splitStructuredItems(joined('postconditions')),
    dependencies: splitStructuredItems(joined('dependencies')),
  };
};

// Keep document-level constraints (roles, state rules, exclusions and source
// matrix) available to every AI batch without duplicating all detailed cases.
const extractUseCaseSharedContext = (value) => {
  const content = normalizeText(value);
  const detailStart = content.search(/^4\.\s*Đặc tả chi tiết\s*$/mi);
  const ruleStart = content.search(/^5\.\s*Quy tắc[^\n]*$/mi);
  const beforeDetails = detailStart >= 0 ? content.slice(0, detailStart).trim() : '';
  const afterDetails = ruleStart >= 0 ? content.slice(ruleStart).trim() : '';
  return normalizeText([beforeDetails, afterDetails].filter(Boolean).join('\n\n')).slice(0, 20000);
};

// BRDs often repeat BR-* codes in an overview matrix before the detailed
// specifications. Keep only occurrences followed by the actual field labels.
const splitDetailedRequirementSections = (value) => {
  const content = normalizeText(value);
  const heading = /^(BR-[A-Z0-9-]*\d+)\s+([^\n]+)$/gmi;
  const matches = [...content.matchAll(heading)];
  const labels = /(?:^|\n)(?:Loại|Mô tả|Mục tiêu nghiệp vụ|Actor \/ Stakeholder|Trong phạm vi|Ngoài phạm vi[^\n]*|Quy tắc nghiệp vụ[^\n]*|Acceptance Criteria[^\n]*|Dữ liệu và hạn chế dữ liệu|Phụ thuộc|Gap \/ Rủi ro[^\n]*|Khuyến nghị baseline|Bằng chứng trong source)(?:\n|$)/gmi;
  const sections = [];
  for (let index = 0; index < matches.length; index += 1) {
    const start = matches[index].index;
    const end = matches[index + 1]?.index ?? content.length;
    const section = content.slice(start, end).trim();
    const labelCount = (section.match(labels) || []).length;
    if (labelCount >= 6) sections.push(section);
  }
  return sections;
};

const USER_STORY_SECTION_LABELS = new Map([
  ['mã user story', 'externalId'],
  ['ưu tiên', 'priority'],
  ['story points', 'storyPoints'],
  ['giờ ước tính', 'estimatedHours'],
  ['giá trị nghiệp vụ', 'businessValue'],
  ['tags', 'labels'],
  ['trong phạm vi', 'inScope'],
  ['ngoài phạm vi', 'outOfScope'],
  ['acceptance criteria', 'acceptanceCriteria'],
  ['business rules', 'businessRules'],
  ['yêu cầu phi chức năng có bằng chứng', 'nonFunctionalRequirements'],
  ['rủi ro và điểm cần xác nhận', 'risks'],
  ['giả định', 'assumptions'],
  ['phụ thuộc', 'dependencies'],
  ['definition of ready', 'definitionOfReady'],
  ['definition of done', 'definitionOfDone'],
  ['dữ liệu kiểm thử cần có', 'testDataRequirements'],
  ['dữ liệu không được sử dụng', 'dataRestrictions'],
  ['bằng chứng mã nguồn', 'sourceEvidence'],
]);

// A structured source document may contain a compact catalog before the full
// stories. Only headings followed by the detailed field set are retained.
const splitDetailedUserStorySections = (value) => {
  const content = normalizeText(value);
  const heading = /^(US-[A-Z0-9-]*\d+)[ \t]+([^\n]+)$/gmi;
  const matches = [...content.matchAll(heading)];
  const labels = /(?:^|\n)(?:Mã User Story|Ưu tiên|Story Points|Giờ ước tính|Giá trị nghiệp vụ|Tags|Trong phạm vi|Ngoài phạm vi|Acceptance Criteria|Business Rules|Yêu cầu phi chức năng có bằng chứng|Rủi ro và điểm cần xác nhận|Giả định|Phụ thuộc|Definition of Ready|Definition of Done|Dữ liệu kiểm thử cần có|Dữ liệu không được sử dụng|Bằng chứng mã nguồn)(?:\n|$)/gmi;
  const sections = [];
  for (let index = 0; index < matches.length; index += 1) {
    const start = matches[index].index;
    const end = matches[index + 1]?.index ?? content.length;
    const section = content.slice(start, end).trim();
    const labelCount = (section.match(labels) || []).length;
    if (labelCount >= 8 && /^As an?\b.*\bI want\b.*\bso that\b/im.test(section)) sections.push(section);
  }
  return sections;
};

// Preserve every explicit field in the structured DOCX without sending it to
// an LLM. This avoids token truncation and makes imports repeatable.
const parseDetailedUserStorySection = (value) => {
  const lines = normalizeText(value).split('\n').map((line) => line.trim()).filter(Boolean);
  const heading = lines[0]?.match(/^(US-[A-Z0-9-]*\d+)[ \t]+(.+)$/i);
  const fields = {};
  let current = '';
  for (const line of lines.slice(1)) {
    const key = USER_STORY_SECTION_LABELS.get(line.toLocaleLowerCase('vi'));
    if (key) {
      current = key;
      if (!fields[current]) fields[current] = [];
      continue;
    }
    if (current) fields[current].push(line);
  }
  const values = (key) => (fields[key] || []).map((item) => item.trim()).filter(Boolean);
  const scalar = (key) => values(key)[0] || '';
  const numberAtStart = (key) => Number((scalar(key).match(/^\d+(?:[.,]\d+)?/) || ['0'])[0].replace(',', '.')) || 0;
  const description = lines.slice(1).find((line) => /^As an?\b.*\bI want\b.*\bso that\b/i.test(line)) || '';
  const priority = scalar('priority');
  return {
    externalId: scalar('externalId') || heading?.[1] || '',
    title: heading?.[2] || '',
    description,
    priority: ['Critical', 'High', 'Medium', 'Low'].includes(priority) ? priority : 'Medium',
    storyPoints: Math.min(21, numberAtStart('storyPoints')),
    estimatedHours: Math.min(10000, numberAtStart('estimatedHours')),
    businessValue: scalar('businessValue'),
    labels: values('labels').flatMap((item) => item.split(/\s*,\s*/)).filter(Boolean),
    inScope: values('inScope'),
    outOfScope: values('outOfScope'),
    acceptanceCriteria: values('acceptanceCriteria'),
    businessRules: values('businessRules'),
    nonFunctionalRequirements: values('nonFunctionalRequirements'),
    risks: values('risks'),
    assumptions: values('assumptions'),
    dependencies: values('dependencies'),
    definitionOfReady: values('definitionOfReady'),
    definitionOfDone: values('definitionOfDone'),
    testDataRequirements: values('testDataRequirements'),
    dataRestrictions: values('dataRestrictions'),
    sourceEvidence: values('sourceEvidence'),
  };
};

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
  } else if (extension === '.xlsx') {
    extractionMethod = 'exceljs';
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheets = [];
    workbook.eachSheet((sheet) => {
      const rows = [];
      sheet.eachRow({ includeEmpty: false }, (row) => {
        const values = row.values.slice(1).map((value) => {
          if (value && typeof value === 'object') return value.text || value.result || value.hyperlink || JSON.stringify(value);
          return String(value ?? '');
        }).map((value) => String(value).trim()).filter(Boolean);
        if (values.length) rows.push(values.join(' | '));
      });
      if (rows.length) sheets.push(`[Sheet: ${sheet.name}]\n${rows.join('\n')}`);
    });
    rawText = sheets.join('\n\n');
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
  normalizeText, detectBusinessDocumentType, splitDetailedUseCaseSections, parseDetailedUseCaseSection, extractUseCaseSharedContext, splitDetailedRequirementSections,
  splitDetailedUserStorySections, parseDetailedUserStorySection,
  safeOriginalName, validateSignature, resolveStoragePath,
  buildStorageLocation, persistDocument, extractDocumentText, removeStoredDocument, sha256,
};
