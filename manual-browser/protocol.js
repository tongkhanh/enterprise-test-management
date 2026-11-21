const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');

const bodyHash = (body) => crypto.createHash('sha256').update(JSON.stringify(body || {})).digest('hex');
function signRequest({ userId, executionId, method, path, body }, secret) {
  if (!secret) throw new Error('Manual browser broker is not configured.');
  return jwt.sign({ executionId: String(executionId), method, path, bodyHash: bodyHash(body) }, secret,
    { algorithm: 'HS256', subject: String(userId), audience: 'etms-manual-browser', issuer: 'etms-api', expiresIn: 45 });
}
function verifyRequest(token, { method, path, body }, secret) {
  const claims = jwt.verify(token, secret, { algorithms: ['HS256'], audience: 'etms-manual-browser', issuer: 'etms-api' });
  if (!/^[a-f0-9]{24}$/.test(claims.sub) || !/^[a-f0-9]{24}$/.test(claims.executionId) || claims.method !== method || claims.path !== path || claims.bodyHash !== bodyHash(body)) throw new Error('Invalid broker request.');
  return { userId: claims.sub, executionId: claims.executionId };
}

function validateInput(events) {
  if (!Array.isArray(events) || !events.length || events.length > 32) throw new Error('Gói thao tác không hợp lệ.');
  for (const event of events) {
    if (!event || typeof event !== 'object') throw new Error('Thao tác không hợp lệ.');
    switch (event.type) {
      case 'pointer':
        if (!['move', 'down', 'up'].includes(event.event) || !Number.isFinite(event.x) || !Number.isFinite(event.y) || event.x < 0 || event.x > 1440 || event.y < 0 || event.y > 900 || ![0, 1, 2].includes(event.button ?? 0)) throw new Error('Tọa độ chuột không hợp lệ.');
        break;
      case 'wheel':
        if (![event.deltaX, event.deltaY].every((n) => Number.isFinite(n) && Math.abs(n) <= 3000)) throw new Error('Cuộn không hợp lệ.');
        break;
      case 'key':
        if (!['down', 'up'].includes(event.event) || typeof event.key !== 'string' || event.key.length > 40 || !/^(?:[\p{L}\p{N}\p{P}\p{S} ]|Enter|Tab|Backspace|Delete|Escape|Arrow(?:Up|Down|Left|Right)|Home|End|PageUp|PageDown|Control|Shift|Alt|Meta|CapsLock|Space|F\d{1,2})$/u.test(event.key)) throw new Error('Phím không được hỗ trợ.');
        break;
      case 'text':
        if (typeof event.text !== 'string' || event.text.length > 4096) throw new Error('Văn bản quá dài.');
        break;
      case 'navigate':
        if (typeof event.url !== 'string' || event.url.length > 4096) throw new Error('URL không hợp lệ.');
        break;
      case 'tab':
        if (typeof event.id !== 'string' || !/^\d{1,5}$/.test(event.id)) throw new Error('Tab không hợp lệ.');
        break;
      case 'dialog':
        if (typeof event.accept !== 'boolean' || (event.text !== undefined && (typeof event.text !== 'string' || event.text.length > 4096))) throw new Error('Dialog không hợp lệ.');
        break;
      case 'back': case 'forward': case 'reload': case 'release': break;
      default: throw new Error('Thao tác không được hỗ trợ.');
    }
  }
  return events;
}

function writeEvent(response, type, data) {
  if (!response.destroyed && response.writableLength < 2 * 1024 * 1024) response.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
}
function waitForDrain(response) {
  return new Promise((resolve) => {
    const done = () => { response.off('drain', done); response.off('close', done); resolve(); };
    response.once('drain', done); response.once('close', done);
    if (response.destroyed) done();
  });
}
module.exports = { signRequest, verifyRequest, validateInput, writeEvent, waitForDrain };
