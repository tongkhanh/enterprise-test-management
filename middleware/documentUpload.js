const path = require('node:path');
const multer = require('multer');
const { AppError } = require('../utils/http');

const allowedExtensions = new Set(['.pdf', '.doc', '.docx']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 3, parts: 4, fieldNameSize: 100 },
  fileFilter: (req, file, callback) => {
    const extension = path.extname(file.originalname || '').toLowerCase();
    if (!allowedExtensions.has(extension)) return callback(new AppError('Chỉ hỗ trợ tệp PDF, DOC hoặc DOCX.', 400));
    callback(null, true);
  },
}).single('document');

const uploadUserStoryDocument = (req, res, next) => upload(req, res, (error) => {
  if (!error) return next();
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return next(new AppError('Tệp vượt quá giới hạn 10 MB.', 413));
  }
  if (error instanceof multer.MulterError) return next(new AppError(`Không thể tải tệp: ${error.message}`, 400));
  return next(error);
});

// Cùng giới hạn/kiểm tra chữ ký cho requirement upload trước khi có User Story.
const uploadRequirement = uploadUserStoryDocument;
module.exports = { uploadUserStoryDocument, uploadRequirement };
