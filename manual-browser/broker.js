const express = require('express');
const crypto = require('node:crypto');
const Docker = require('dockerode');
const { verifyRequest, waitForDrain } = require('./protocol');
const { validateBrowserUrl } = require('./urlPolicy');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function createBroker({ secret, docker = new Docker(), image = process.env.MANUAL_BROWSER_IMAGE || 'etms-manual-browser:local', network = process.env.MANUAL_BROWSER_NETWORK || 'etms-manual-browsers', idleMs = 15 * 60 * 1000, maxSessions = 4, validateUrl = validateBrowserUrl } = {}) {
  if (!secret) throw new Error('Manual browser broker secret is required.');
  const app = express(); app.use(express.json({ limit: '200kb' }));
  const sessions = new Map(); const pending = new Map();
  const label = { 'etms.manual-browser': 'true', 'etms.manual-network': network };
  const keyFor = ({ userId, executionId }) => `${userId}:${executionId}`;
  async function destroy(key) {
    const item = sessions.get(key); if (!item) return;
    await item.container.remove({ force: true }).catch((error) => { if (error.statusCode !== 404) throw error; });
    sessions.delete(key);
  }
  async function cleanupOrphans() {
    const old = await docker.listContainers({ all: true, filters: { label: Object.entries(label).map(([key, value]) => `${key}=${value}`) } });
    await Promise.all(old.map((item) => docker.getContainer(item.Id).remove({ force: true }).catch(() => {})));
  }
  const requestRuntime = (item, path, options = {}) => fetch(`${item.url}${path}`, {
    ...options, headers: { Authorization: `Bearer ${item.token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
    signal: options.signal || AbortSignal.timeout(45000),
  });
  async function create(identity, targetUrl) {
    const key = keyFor(identity);
    const existing = sessions.get(key);
    if (existing) {
      if (existing.targetUrl !== targetUrl) throw Object.assign(new Error('URL đã thay đổi. Kết thúc phiên cũ trước khi mở lại.'), { status: 409 });
      return existing;
    }
    if (sessions.size + pending.size >= maxSessions || [...sessions.keys(), ...pending.keys()].some((entry) => entry.startsWith(`${identity.userId}:`) && entry !== key)) throw Object.assign(new Error('Đã đạt giới hạn phiên. Kết thúc phiên Manual đang mở trước.'), { status: 409 });
    try { await validateUrl(targetUrl); }
    catch (error) { throw Object.assign(new Error(error.message), { status: error.statusCode || 400 }); }
    const token = crypto.randomBytes(32).toString('hex');
    let container;
    try {
      container = await docker.createContainer({
        Image: image, Labels: label,
        Env: [`MANUAL_SESSION_TOKEN=${token}`, `MANUAL_TARGET_URL=${targetUrl}`, `MANUAL_IDLE_MS=${idleMs}`, `WEB_ANALYZER_ALLOW_PRIVATE=${process.env.WEB_ANALYZER_ALLOW_PRIVATE || 'false'}`, `WEB_ANALYZER_ALLOWED_HOSTS=${process.env.WEB_ANALYZER_ALLOWED_HOSTS || ''}`],
        User: 'pwuser', WorkingDir: '/app',
        HostConfig: { NetworkMode: network, AutoRemove: true, Init: true, ReadonlyRootfs: true, CapDrop: ['ALL'], SecurityOpt: ['no-new-privileges:true'], Memory: 1536 * 1024 * 1024, NanoCpus: 1500000000, PidsLimit: 256, ShmSize: 256 * 1024 * 1024, Tmpfs: { '/tmp': 'rw,nosuid,nodev,size=536870912,mode=1777' } },
      });
      await container.start(); const inspected = await container.inspect();
      const ip = inspected.NetworkSettings.Networks[network]?.IPAddress;
      if (!ip) throw new Error('Manual browser network unavailable.');
      const item = { container, token, url: `http://${ip}:3101`, targetUrl, createdAt: Date.now(), lastActivity: Date.now() };
      let ready = false;
      for (let attempt = 0; attempt < 30; attempt++) {
        try { const response = await requestRuntime(item, '/health', { signal: AbortSignal.timeout(1500) }); if (response.ok) { ready = true; break; } } catch { /* browser startup */ }
        await wait(500);
      }
      if (!ready) throw new Error('Manual browser startup timed out.');
      sessions.set(key, item); return item;
    } catch (error) {
      await container?.remove({ force: true }).catch(() => {});
      throw Object.assign(new Error('Không khởi tạo được trình duyệt Manual. Kiểm tra image etms-manual-browser và Docker worker.'), { status: 503 });
    }
  }
  const reap = async () => {
    await Promise.all([...sessions].filter(([, item]) => Date.now() - item.lastActivity > idleMs || Date.now() - item.createdAt > 2 * 60 * 60 * 1000).map(([key]) => destroy(key)));
  };
  const prune = setInterval(() => {
    reap().catch(() => {});
  }, 5000); prune.unref();
  app.get('/health', (_req, res) => res.json({ ready: true }));
  app.use((req, res, next) => {
    try { req.identity = verifyRequest((req.headers.authorization || '').replace(/^Bearer /, ''), { method: req.method, path: req.path, body: req.body }, secret); next(); }
    catch { res.status(401).json({ error: 'Không có quyền truy cập phiên trình duyệt.' }); }
  });
  app.post('/session', async (req, res, next) => {
    const key = keyFor(req.identity);
    try {
      if (!pending.has(key)) {
        const promise = create(req.identity, req.body.targetUrl).finally(() => pending.delete(key)); pending.set(key, promise);
      }
      const item = await pending.get(key);
      res.json({ status: 'Ready', targetUrl: item.targetUrl, idleMs, createdAt: item.createdAt });
    } catch (error) { next(error); }
  });
  app.delete('/session', async (req, res, next) => {
    try { const key = keyFor(req.identity); if (pending.has(key)) await pending.get(key).catch(() => {}); await destroy(key); res.json({ status: 'Ended' }); } catch (error) { next(error); }
  });
  app.use(async (req, res, next) => {
    const key = keyFor(req.identity); const item = sessions.get(key);
    if (!item) return res.status(404).json({ error: 'Phiên đã kết thúc hoặc hết thời gian chờ. Bấm Bắt đầu để mở phiên mới.' });
    const runtimePath = { 'GET /session': '/health', 'GET /stream': '/stream', 'POST /input': '/input', 'GET /screenshot': '/screenshot' }[`${req.method} ${req.path}`];
    if (!runtimePath) return res.sendStatus(404);
    const abort = new AbortController(); res.on('close', () => abort.abort());
    try {
      const upstream = await requestRuntime(item, runtimePath, { method: req.method, ...(req.method === 'POST' ? { body: JSON.stringify(req.body) } : {}), signal: req.path === '/stream' ? abort.signal : AbortSignal.timeout(45000) });
      if (!upstream.ok) { if (upstream.status === 410) await destroy(key); return res.status(upstream.status).json({ error: 'Không thể thao tác phiên trình duyệt. Thử kết nối lại.' }); }
      if (['/input', '/screenshot'].includes(req.path)) item.lastActivity = Date.now();
      res.status(200).set({ 'Content-Type': upstream.headers.get('Content-Type') || 'application/json', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
      res.flushHeaders();
      for await (const chunk of upstream.body) {
        if (abort.signal.aborted) break;
        if (!res.write(chunk)) await waitForDrain(res);
      }
      res.end();
    } catch (error) { if (abort.signal.aborted) return; if (res.headersSent) res.end(); else next(Object.assign(new Error('Không kết nối được trình duyệt Manual.'), { status: 503 })); }
  });
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.status ? error.message : 'Dịch vụ Manual Browser gặp lỗi.' }));
  return { app, cleanupOrphans, reap, close: async () => { clearInterval(prune); await Promise.all([...sessions.keys()].map(destroy)); }, sessions };
}
if (require.main === module) {
  const broker = createBroker({ secret: process.env.MANUAL_BROWSER_BROKER_SECRET });
  broker.cleanupOrphans().then(() => {
    const server = broker.app.listen(3100, '0.0.0.0', () => console.log('Manual browser broker ready'));
    for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => broker.close().finally(() => server.close(() => process.exit(0))));
  }).catch(() => { console.error('Manual browser broker could not initialize Docker.'); process.exit(1); });
}
module.exports = { createBroker };
