const crypto = require('node:crypto');
const { WebSocketServer } = require('ws');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { validateInput } = require('../manual-browser/protocol');
const browser = require('./manualBrowserService');

const tickets = new Map();
function issueTicket(req) {
  for (const [key, value] of tickets) if (value.expires < Date.now()) tickets.delete(key);
  // At most one pending ticket per session/execution; tickets never contain a URL or enter logs.
  for (const [key, value] of tickets) if (value.sessionId === req.sessionId && value.id === req.params.id) tickets.delete(key);
  if (tickets.size >= 1000) throw new Error('Too many pending browser connections');
  const ticket = crypto.randomBytes(32).toString('hex');
  tickets.set(ticket, { token: req.token, sessionId: req.sessionId, id: req.params.id, expires: Date.now() + 30000 });
  return { ticket, path: `/api/v1/test-executions/${req.params.id}/manual-browser/control` };
}
function middleware(fn, req) {
  return new Promise((resolve, reject) => fn(req, { status() { return this; }, json() { reject(new Error('Unauthorized')); } }, (error) => error ? reject(error) : resolve()));
}
async function authenticate(req) {
  await middleware(protect, req);
  await middleware(authorize('execution:execute', 'execution:manage'), req);
  return require('../controllers/manualBrowserController').access(req, { starting: true });
}
function attachManualBrowserSockets(server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 200000, handleProtocols: () => 'etms-manual' });
  server.on('upgrade', async (req, socket, head) => {
    const match = req.url?.match(/^\/api\/v1\/test-executions\/([a-f0-9]{24})\/manual-browser\/control$/);
    if (!match) return socket.destroy();
    try {
      const origin = new URL(req.headers.origin);
      const allowed = new Set([`http://${req.headers.host}`, `https://${req.headers.host}`]);
      if (process.env.APP_BASE_URL) allowed.add(new URL(process.env.APP_BASE_URL).origin);
      if (process.env.NODE_ENV !== 'production') { allowed.add('http://localhost:5173'); allowed.add('http://127.0.0.1:5173'); }
      if (!allowed.has(origin.origin)) throw new Error('Origin');
      const protocols = String(req.headers['sec-websocket-protocol'] || '').split(',').map((value) => value.trim());
      const ticket = protocols.find((value) => /^[a-f0-9]{64}$/.test(value));
      const entry = tickets.get(ticket); tickets.delete(ticket);
      if (!protocols.includes('etms-manual') || !entry || entry.id !== match[1] || entry.expires < Date.now()) throw new Error('Ticket');
      req.headers.authorization = `Bearer ${entry.token}`; req.params = { id: entry.id };
      const { identity } = await authenticate(req);
      if (socket.destroyed) return;
      wss.handleUpgrade(req, socket, head, (ws) => {
        let busy = false; let alive = true;
        const verify = setInterval(async () => { try { await authenticate(req); } catch { ws.close(1008, 'Session expired'); } }, 30000); verify.unref();
        ws.on('pong', () => { alive = true; });
        const ping = setInterval(() => { if (!alive) return ws.terminate(); alive = false; ws.ping(); }, 20000); ping.unref();
        ws.on('close', () => { clearInterval(verify); clearInterval(ping); browser.requestBrowser(identity, 'POST', '/input', { events: [{ type: 'release' }] }).catch(() => {}); });
        ws.on('error', () => {});
        ws.on('message', async (raw) => {
          // One acknowledged batch at a time: never replay uncertain clicks or passwords.
          if (busy) return ws.close(1008, 'Input queue full');
          busy = true;
          let seq;
          try {
            const body = JSON.parse(raw); seq = body.seq;
            if (!Number.isSafeInteger(seq) || seq < 0) throw new Error('Sequence');
            const events = validateInput(body.events);
            await browser.requestBrowser(identity, 'POST', '/input', { events });
            if (ws.readyState === 1) ws.send(JSON.stringify({ seq, ok: true }));
          } catch { if (ws.readyState === 1) ws.send(JSON.stringify({ seq, ok: false, error: 'Thao tác chưa được xác nhận. Kiểm tra màn hình trước khi thử lại.' })); }
          finally { busy = false; }
        });
      });
    } catch { if (!socket.destroyed) socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); }
  });
  server.on('close', () => { for (const ws of wss.clients) ws.terminate(); wss.close(); });
  return wss;
}
module.exports = { issueTicket, attachManualBrowserSockets };
