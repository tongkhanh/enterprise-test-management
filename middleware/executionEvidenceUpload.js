const path = require('node:path');
const multer = require('multer');
const { AppError } = require('../utils/http');

const extensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.mp4', '.webm', '.txt', '.log', '.json', '.xml', '.har', '.zip', '.pdf']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 5, fields: 2, parts: 8, fieldNameSize: 100 },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname || '').toLowerCase();
    if (!extensions.has(extension)) return callback(new AppError('Evidence chỉ hỗ trợ ảnh, video, log, HAR, ZIP hoặc PDF.', 400));
    callback(null, true);
  },
}).array('evidence', 5);

module.exports = (req, res, next) => upload(req, res, (error) => {
  if (!error) return next();
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') return next(new AppError('Mỗi evidence không được vượt quá 25 MB.', 413));
  if (error instanceof multer.MulterError) return next(new AppError(`Không thể tải evidence: ${error.message}`, 400));
  return next(error);
});
