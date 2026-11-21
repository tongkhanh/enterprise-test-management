const { AppError } = require('../utils/http');
const { signRequest } = require('../manual-browser/protocol');

async function requestBrowser(identity, method, path, body, options = {}) {
  const base = process.env.MANUAL_BROWSER_BROKER_URL;
  if (!base) throw new AppError('Manual Browser chưa được bật. Khởi động dịch vụ manual-browser-broker bằng Docker Compose.', 503);
  const token = signRequest({ ...identity, method, path, body }, process.env.MANUAL_BROWSER_BROKER_SECRET || process.env.JWT_SECRET);
  let response;
  try {
    response = await fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: options.signal || AbortSignal.timeout(70000) });
  } catch { throw new AppError('Dịch vụ Manual Browser chưa sẵn sàng. Kiểm tra Docker Compose.', 503); }
  if (!response.ok) {
    const message = await response.json().catch(() => ({}));
    throw new AppError(message.error || 'Phiên Manual Browser không khả dụng.', [400, 403, 404, 409, 410, 429, 503].includes(response.status) ? response.status : 502);
  }
  return response;
}
module.exports = { requestBrowser };
