const mongoose = require('mongoose');

class AppError extends Error {
  constructor(message, statusCode = 500, details) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
  }
}

const assertObjectId = (value, label = 'ID') => {
  if (!mongoose.isValidObjectId(value)) {
    throw new AppError(`${label} không hợp lệ.`, 400);
  }
};

const pagination = (query) => {
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 20, 1), 100);
  return { page, limit, skip: (page - 1) * limit };
};

const list = async (Model, req, options = {}) => {
  const { page, limit, skip } = pagination(req.query);
  const filter = { ...(options.baseFilter || {}) };
  for (const key of options.filters || []) {
    if (req.query[key] !== undefined && req.query[key] !== '') filter[key] = req.query[key];
  }
  if (req.query.search && options.searchFields?.length) {
    const escaped = req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = options.searchFields.map((field) => ({ [field]: { $regex: escaped, $options: 'i' } }));
  }
  let query = Model.find(filter).sort(options.sort || '-createdAt').skip(skip).limit(limit);
  if (options.populate) query = query.populate(options.populate);
  const [data, total] = await Promise.all([query, Model.countDocuments(filter)]);
  return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
};

const getById = async (Model, id, populate) => {
  assertObjectId(id);
  let query = Model.findById(id);
  if (populate) query = query.populate(populate);
  const document = await query;
  if (!document) throw new AppError(`${Model.modelName} không tồn tại.`, 404);
  return document;
};

const send = (res, data, status = 200, extra = {}) =>
  res.status(status).json({ success: true, data, ...extra });

module.exports = { AppError, assertObjectId, pagination, list, getById, send };
