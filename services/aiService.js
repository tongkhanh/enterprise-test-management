const OpenAI = require('openai');
const mongoose = require('mongoose');
const { Bug, BugEmbedding, KnowledgeBase } = require('../models');
const { AppError } = require('../utils/http');

let openai;
const PROVIDERS = { googleai: 'GoogleAI', openai: 'OpenAI' };

const normalizeProvider = (value) => PROVIDERS[String(value || '').trim().toLowerCase()] || null;
const resolveProvider = (requestedProvider) => normalizeProvider(process.env.AI_PROVIDER) || normalizeProvider(requestedProvider) || 'GoogleAI';

const resolveModel = (provider, requestedModel) => {
  if (provider === 'GoogleAI') {
    const configured = process.env.AI_MODEL || process.env.GEMINI_MODEL;
    return configured?.startsWith('gemini-') ? configured : (requestedModel?.startsWith('gemini-') ? requestedModel : 'gemini-3.5-flash');
  }
  const configured = process.env.AI_MODEL || process.env.OPENAI_MODEL;
  return configured && !configured.startsWith('gemini-') ? configured : (requestedModel && !requestedModel.startsWith('gemini-') ? requestedModel : 'gpt-4o-mini');
};

const getAiStatus = () => {
  const provider = resolveProvider();
  const configured = provider === 'GoogleAI' ? Boolean(process.env.GEMINI_API_KEY?.trim()) : Boolean(process.env.OPENAI_API_KEY?.trim());
  const embeddingProvider = normalizeProvider(process.env.AI_EMBEDDING_PROVIDER) || provider;
  return {
    provider,
    model: resolveModel(provider),
    configured,
    embedding: {
      provider: embeddingProvider,
      model: process.env.AI_EMBEDDING_MODEL || (embeddingProvider === 'GoogleAI' ? 'gemini-embedding-001' : 'text-embedding-3-small'),
      dimensions: Math.min(Math.max(Number(process.env.AI_EMBEDDING_DIMENSIONS) || 1536, 128), 3072),
      configured: embeddingProvider === 'GoogleAI' ? Boolean(process.env.GEMINI_API_KEY?.trim()) : Boolean(process.env.OPENAI_API_KEY?.trim()),
    },
  };
};

const isAiConfigured = () => getAiStatus().configured;
const isEmbeddingConfigured = () => getAiStatus().embedding.configured;

const getOpenAI = () => {
  if (!process.env.OPENAI_API_KEY) throw new AppError('Chưa cấu hình OPENAI_API_KEY.', 503);
  if (!openai) openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openai;
};

const parseJson = (text) => {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(cleaned); } catch (_) {
    const start = Math.min(...['[', '{'].map((char) => { const index = cleaned.indexOf(char); return index < 0 ? Infinity : index; }));
    const end = Math.max(cleaned.lastIndexOf(']'), cleaned.lastIndexOf('}'));
    if (!Number.isFinite(start) || end < start) throw new AppError('AI không trả về JSON hợp lệ.', 502);
    return JSON.parse(cleaned.slice(start, end + 1));
  }
};

const callOpenAI = async ({ prompt, system, model = 'gpt-4o-mini', temperature = 0.3, maxTokens = 2048, json = false }) => {
  const response = await getOpenAI().chat.completions.create({
    model,
    temperature,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: system || 'Bạn là chuyên gia QA cấp doanh nghiệp. Trả lời chính xác, ngắn gọn.' },
      { role: 'user', content: prompt },
    ],
    ...(json ? { response_format: { type: 'json_object' } } : {}),
  });
  return { text: response.choices[0]?.message?.content || '', usage: response.usage || {}, model, provider: 'OpenAI' };
};

const readGeminiError = async (response) => {
  try {
    const payload = await response.json();
    return payload?.error?.message || JSON.stringify(payload);
  } catch (_) {
    return response.text().catch(() => 'Không có nội dung lỗi.');
  }
};

const requestGemini = async (path, body) => {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new AppError('Chưa cấu hình GEMINI_API_KEY cho Gemini 3.5 Flash.', 503);
  let response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new AppError(`Không thể kết nối Gemini API: ${error.message}`, 502);
  }
  if (!response.ok) {
    const message = await readGeminiError(response);
    if (response.status === 429) throw new AppError(`Gemini Free Tier đã đạt giới hạn tạm thời: ${message}`, 429);
    throw new AppError(`Gemini API lỗi ${response.status}: ${message}`, 502);
  }
  return response.json();
};

const callGemini = async ({ prompt, system, model = 'gemini-3.5-flash', maxTokens = 2048, json = false }) => {
  const data = await requestGemini('interactions', {
    model,
    input: prompt,
    system_instruction: system || 'Bạn là chuyên gia QA cấp doanh nghiệp.',
    store: false,
    generation_config: {
      max_output_tokens: maxTokens,
      thinking_level: 'low',
    },
    ...(json ? { response_format: [{ type: 'text', mime_type: 'application/json' }] } : {}),
  });
  const text = (data.steps || [])
    .filter((step) => step.type === 'model_output')
    .flatMap((step) => step.content || [])
    .filter((content) => content.type === 'text')
    .map((content) => content.text || '')
    .join('');
  if (!text) {
    const reason = data.error?.message || data.status || 'EMPTY_RESPONSE';
    throw new AppError(`Gemini không trả về nội dung (${reason}).`, 502);
  }
  return {
    text,
    usage: {
      prompt_tokens: data.usage?.total_input_tokens || 0,
      completion_tokens: data.usage?.total_output_tokens || 0,
      total_tokens: data.usage?.total_tokens || 0,
    },
    model: data.model || model,
    provider: 'GoogleAI',
  };
};

const complete = (options = {}) => {
  const provider = resolveProvider(options.provider);
  const resolvedOptions = { ...options, model: resolveModel(provider, options.model) };
  if (provider === 'GoogleAI') return callGemini(resolvedOptions);
  if (provider === 'OpenAI') return callOpenAI(resolvedOptions);
  throw new AppError(`AI provider ${provider} chưa được hỗ trợ.`, 503);
};

// Deterministic drafts are only permitted when Gemini explicitly reports that
// its quota/rate limit has been exhausted or that the model is temporarily
// overloaded. Other failures (networking, invalid output, bad configuration,
// etc.) must remain visible to the caller.
const isGeminiQuotaExhausted = (error) => {
  const status = Number(error?.statusCode || error?.status || 0);
  const message = String(error?.message || '');
  const quotaMessage = /(gemini|rate\s*limit|quota|free\s*tier|resource\s*exhausted)/i.test(message);
  const temporaryOverload = /gemini.*(?:api\s*lỗi\s*)?503.*(?:high\s*demand|temporar|overload|unavailable|try\s*again\s*later)/i.test(message);
  return (status === 429 && quotaMessage) || temporaryOverload;
};

const normalizeVector = (vector) => {
  const magnitude = Math.sqrt(vector.reduce((total, value) => total + value ** 2, 0));
  return magnitude ? vector.map((value) => value / magnitude) : vector;
};

const createEmbedding = async (text) => {
  const status = getAiStatus().embedding;
  if (status.provider === 'GoogleAI') {
    const data = await requestGemini(`models/${status.model}:embedContent`, {
      model: `models/${status.model}`,
      content: { parts: [{ text: String(text).slice(0, 30000) }] },
      embedContentConfig: {
        taskType: 'SEMANTIC_SIMILARITY',
        outputDimensionality: status.dimensions,
        autoTruncate: true,
      },
    });
    const vector = data.embedding?.values;
    if (!Array.isArray(vector) || vector.length !== status.dimensions) throw new AppError('Gemini không trả về embedding hợp lệ.', 502);
    return { vector: normalizeVector(vector), usage: data.usageMetadata || {}, model: status.model, provider: 'GoogleAI' };
  }
  const response = await getOpenAI().embeddings.create({ model: status.model, input: String(text).slice(0, 30000), dimensions: status.dimensions });
  return { vector: response.data[0].embedding, usage: response.usage || {}, model: status.model, provider: 'OpenAI' };
};

const cosine = (a, b) => {
  let dot = 0; let aa = 0; let bb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) { dot += a[i] * b[i]; aa += a[i] ** 2; bb += b[i] ** 2; }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
};

const vectorFind = async ({ Model, index, path = 'embedding', vector, filter, limit = 5, populate }) => {
  try {
    const rows = await Model.aggregate([
      { $vectorSearch: { index, path, queryVector: vector, numCandidates: Math.max(50, limit * 10), limit, ...(filter ? { filter } : {}) } },
      { $addFields: { score: { $meta: 'vectorSearchScore' } } },
      { $project: { [path]: 0 } },
    ]);
    return rows;
  } catch (error) {
    let query = Model.find(filter || {}).limit(500).lean();
    if (populate) query = query.populate(populate);
    const rows = await query;
    return rows.map((row) => ({ ...row, score: cosine(vector, row[path] || []) })).sort((a, b) => b.score - a.score).slice(0, limit).map((row) => { delete row[path]; return row; });
  }
};

const projectId = (value) => (typeof value === 'string' ? mongoose.Types.ObjectId.createFromHexString(value) : value);

const findDuplicateBugs = async ({ text, project, excludeBug, limit = 5 }) => {
  const { vector } = await createEmbedding(text);
  const filter = { project: projectId(project) };
  if (excludeBug) filter.bug = { $ne: projectId(excludeBug) };
  const rows = await vectorFind({ Model: BugEmbedding, index: process.env.BUG_VECTOR_INDEX || 'bug_vector_index', vector, filter, limit, populate: { path: 'bug', select: 'title severity priority status' } });
  return Promise.all(rows.map(async (row) => ({ bug: row.bug?.title ? row.bug : await Bug.findById(row.bug).select('title severity priority status').lean(), score: row.score, duplicatePercent: Math.round(Math.max(0, row.score) * 10000) / 100 })));
};

const indexBugAndFindDuplicates = async (bug) => {
  const text = `${bug.title}\n${bug.description}\n${bug.stepsToReproduce || ''}`;
  const { vector, model } = await createEmbedding(text);
  await BugEmbedding.findOneAndUpdate({ bug: bug._id }, { textContent: text, embedding: vector, embeddingModel: model, dimensions: vector.length, bug: bug._id, project: bug.project }, { upsert: true, new: true });
  const filter = { project: bug.project, bug: { $ne: bug._id } };
  const rows = await vectorFind({ Model: BugEmbedding, index: process.env.BUG_VECTOR_INDEX || 'bug_vector_index', vector, filter, limit: 5, populate: { path: 'bug', select: 'title severity priority status' } });
  return Promise.all(rows.map(async (row) => ({ bug: row.bug?.title ? row.bug : await Bug.findById(row.bug).select('title severity priority status').lean(), score: row.score, duplicatePercent: Math.round(Math.max(0, row.score) * 10000) / 100 })));
};

const searchKnowledge = async ({ question, project, limit = 5 }) => {
  const { vector } = await createEmbedding(question);
  return vectorFind({ Model: KnowledgeBase, index: process.env.KNOWLEDGE_VECTOR_INDEX || 'knowledge_vector_index', vector, filter: { project, isActive: true }, limit });
};

module.exports = {
  complete,
  parseJson,
  createEmbedding,
  findDuplicateBugs,
  indexBugAndFindDuplicates,
  searchKnowledge,
  getAiStatus,
  isAiConfigured,
  isEmbeddingConfigured,
  isGeminiQuotaExhausted,
};
