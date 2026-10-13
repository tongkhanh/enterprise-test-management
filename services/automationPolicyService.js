const { AppError } = require('../utils/http');
const secretPattern = /password|secret|token|authorization|api.?key/i;
function mask(value, key = '') {
  if (secretPattern.test(key)) return '[REDACTED]';
  if (Array.isArray(value)) return value.map((x) => mask(x));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mask(v, k)]));
  return typeof value === 'string' ? value.replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]') : value;
}
function parseDataset(content, format) {
  let rows;
  if (format === 'json') { try { rows = JSON.parse(content); } catch { throw new AppError('JSON dataset không hợp lệ.', 400); } }
  else {
    const records = []; let row = [], cell = '', quoted = false;
    for (let i = 0; i < content.length; i += 1) {
      const c = content[i];
      if (c === '"') { if (quoted && content[i + 1] === '"') { cell += '"'; i += 1; } else quoted = !quoted; }
      else if (c === ',' && !quoted) { row.push(cell); cell = ''; }
      else if (c === '\n' && !quoted) { row.push(cell.replace(/\r$/, '')); records.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (quoted) throw new AppError('CSV thiếu dấu đóng ngoặc kép.', 400);
    if (cell || row.length) { row.push(cell.replace(/\r$/, '')); records.push(row); }
    const headers = records.shift() || [];
    if (new Set(headers).size !== headers.length || headers.some((x) => !x || ['__proto__', 'constructor', 'prototype'].includes(x))) throw new AppError('CSV header không hợp lệ.', 400);
    rows = records.filter((r) => r.some(Boolean)).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] || ''])));
  }
  if (!Array.isArray(rows) || !rows.length || rows.length > 1000 || rows.some((x) => !x || Array.isArray(x) || typeof x !== 'object')) throw new AppError('Dataset cần 1–1000 dòng object.', 400);
  return rows;
}
function normalizeMatrix(matrix = []) {
  if (!Array.isArray(matrix) || matrix.length > 12) throw new AppError('Matrix tối đa 12 cấu hình.', 400);
  return (matrix.length ? matrix : [{ browser: 'chromium' }]).map((x) => {
    if (!['chromium', 'firefox', 'webkit', 'chrome', 'edge'].includes(x.browser)) throw new AppError('Browser không được hỗ trợ.', 400);
    if (x.os && x.os !== 'linux') throw new AppError('Worker Docker hiện chạy Linux; cần remote runner riêng cho Windows/macOS.', 422);
    if (x.browserVersion) throw new AppError('Pinned browser version cần runner image riêng; profile mặc định dùng browser đi kèm image.', 422);
    if (x.device && !require('playwright').devices[x.device]) throw new AppError('Mobile device profile không tồn tại.', 422);
    return { browser: x.browser, os: 'linux', device: String(x.device || '').slice(0, 80), width: Math.max(320, Math.min(Number(x.width) || 1440, 3840)), height: Math.max(320, Math.min(Number(x.height) || 900, 2160)), browserVersion: String(x.browserVersion || '').slice(0, 30) };
  });
}
function flakyStats(statuses) {
  const completed = statuses.filter((x) => ['Passed', 'Failed'].includes(x));
  let transitions = 0;
  for (let i = 1; i < completed.length; i += 1) if (completed[i] !== completed[i - 1]) transitions += 1;
  return { samples: completed.length, transitions, score: completed.length > 1 ? Math.round(transitions / (completed.length - 1) * 100) : 0, passed: completed.filter((x) => x === 'Passed').length, failed: completed.filter((x) => x === 'Failed').length };
}
module.exports = { mask, parseDataset, normalizeMatrix, flakyStats };
