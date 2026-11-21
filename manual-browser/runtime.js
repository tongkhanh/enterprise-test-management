const http = require('node:http');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const { validateInput, writeEvent } = require('./protocol');
const { validateBrowserUrl } = require('./urlPolicy');

const WIDTH = 1440; const HEIGHT = 900;
async function createRuntime({ token, targetUrl, launch = () => chromium.launch({ headless: false }), validateUrl = validateBrowserUrl, idleMs = 15 * 60 * 1000, maxMs = 2 * 60 * 60 * 1000, onExpired = () => {} }) {
  if (!token) throw new Error('Missing session token');
  await validateUrl(targetUrl);
  const browser = await launch();
  const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, acceptDownloads: false, serviceWorkers: 'block' });
  const viewers = new Set(); const pages = new Map(); const heldKeys = new Set();
  let current; let cdp; let nextId = 0; let dialog; let ended = false;
  let latestFrame; let lastFrameAt = 0;
  const navigation = new WeakMap();
  let lastActivity = Date.now(); const createdAt = Date.now(); let inputQueue = Promise.resolve(); let queuedInputs = 0;
  const broadcast = (type, data) => viewers.forEach((res) => writeEvent(res, type, data));
  const metadata = () => ({ url: current?.url() || '', navigation: navigation.get(current) || 'loading', tabs: [...pages].map(([id, page]) => ({ id, url: page.url(), active: page === current })), width: WIDTH, height: HEIGHT, lastActivity, idleMs });
  const sendMetadata = () => broadcast('state', metadata());
  function navigate(page, operation) {
    navigation.set(page, 'loading'); sendMetadata();
    operation().then(() => { navigation.set(page, 'ready'); sendMetadata(); }).catch(() => { navigation.set(page, 'error'); sendMetadata(); });
  }
  async function selectPage(page) {
    if (ended || page.isClosed()) return;
    if (current === page && cdp) return;
    if (cdp) { await cdp.detach().catch(() => {}); cdp = null; }
    current = page; dialog = null; latestFrame = null;
    await page.bringToFront();
    cdp = await context.newCDPSession(page);
    const client = cdp;
    client.on('Page.screencastFrame', (frame) => {
      if (client === cdp) {
        latestFrame = { data: frame.data, width: WIDTH, height: HEIGHT };
        if (Date.now() - lastFrameAt >= 80) { lastFrameAt = Date.now(); broadcast('frame', latestFrame); }
      }
      client.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => {});
    });
    await client.send('Page.startScreencast', { format: 'jpeg', quality: 60, maxWidth: 1280, maxHeight: 800, everyNthFrame: 1 });
    sendMetadata();
  }
  let selection = Promise.resolve();
  const choose = (page) => { selection = selection.catch(() => {}).then(() => selectPage(page)); return selection; };
  context.on('page', (page) => {
    const id = String(++nextId); pages.set(id, page);
    navigation.set(page, 'loading');
    page.on('domcontentloaded', () => { navigation.set(page, 'ready'); if (current === page) sendMetadata(); });
    page.on('requestfailed', (request) => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) { navigation.set(page, 'error'); if (current === page) sendMetadata(); } });
    page.on('framenavigated', (frame) => { if (frame === page.mainFrame() && current === page) sendMetadata(); });
    page.on('dialog', (value) => { if (current === page) { dialog = value; broadcast('dialog', { type: value.type(), message: value.message(), defaultValue: value.defaultValue() }); } else value.dismiss().catch(() => {}); });
    page.on('filechooser', () => broadcast('notice', { message: 'Phiên bản này chưa hỗ trợ tải tệp vào website đích. Bạn vẫn có thể gắn evidence trong ETMS.' }));
    page.on('close', () => { pages.delete(id); if (current === page && !ended) { const other = [...pages.values()].at(-1); if (other) choose(other).catch(() => {}); else context.newPage().catch(() => {}); } sendMetadata(); });
    choose(page).catch(() => broadcast('notice', { message: 'Không thể mở tab trình duyệt.' }));
  });
  // Validate every network request, including redirects and popup destinations.
  await context.route('**/*', async (route) => {
    try {
      const url = new URL(route.request().url());
      if (!['http:', 'https:'].includes(url.protocol) || ['3100', '3101'].includes(url.port)) return route.abort();
      await validateUrl(url.href);
      await route.continue();
    } catch { await route.abort().catch(() => {}); }
  });
  const page = await context.newPage(); await choose(page);
  navigate(page, () => page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }));

  async function close() {
    if (ended) return; ended = true; clearInterval(watchdog);
    broadcast('ended', { message: 'Phiên trình duyệt đã kết thúc.' });
    viewers.forEach((res) => res.end()); viewers.clear();
    await browser.close().catch(() => {});
  }
  const watchdog = setInterval(() => {
    if (Date.now() - lastActivity > idleMs || Date.now() - createdAt > maxMs) close().finally(onExpired);
  }, 5000); watchdog.unref();
  async function apply(event) {
    const active = current;
    if (!active || active.isClosed()) throw new Error('Tab đã đóng.');
    switch (event.type) {
      case 'pointer': {
        const button = ['left', 'middle', 'right'][event.button || 0];
        await active.mouse.move(event.x, event.y);
        if (event.event === 'down') await active.mouse.down({ button });
        if (event.event === 'up') await active.mouse.up({ button });
        break;
      }
      case 'wheel': await active.mouse.wheel(event.deltaX, event.deltaY); break;
      case 'text': await active.keyboard.insertText(event.text); break;
      case 'key':
        if (event.event === 'down') { await active.keyboard.down(event.key); heldKeys.add(event.key); }
        else { await active.keyboard.up(event.key); heldKeys.delete(event.key); }
        break;
      case 'release':
        for (const key of heldKeys) await active.keyboard.up(key).catch(() => {});
        heldKeys.clear();
        for (const button of ['left', 'middle', 'right']) await active.mouse.up({ button }).catch(() => {});
        break;
      case 'navigate':
        await validateUrl(event.url);
        navigate(active, () => active.goto(event.url, { waitUntil: 'domcontentloaded', timeout: 30000 })); break;
      case 'back': navigate(active, () => active.goBack({ waitUntil: 'domcontentloaded', timeout: 30000 })); break;
      case 'forward': navigate(active, () => active.goForward({ waitUntil: 'domcontentloaded', timeout: 30000 })); break;
      case 'reload': navigate(active, () => active.reload({ waitUntil: 'domcontentloaded', timeout: 30000 })); break;
      case 'tab': if (!pages.has(event.id)) throw new Error('Tab đã đóng.'); await choose(pages.get(event.id)); break;
      case 'dialog': if (dialog) { const value = dialog; dialog = null; await (event.accept ? value.accept(event.text) : value.dismiss()); } break;
    }
  }
  const authorized = (req) => {
    const actual = Buffer.from(req.headers.authorization || ''); const expected = Buffer.from(`Bearer ${token}`);
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  };
  const server = http.createServer(async (req, res) => {
    if (!authorized(req)) { res.writeHead(401); return res.end(); }
    res.setHeader('Cache-Control', 'no-store');
    if (ended) { res.writeHead(410); return res.end(); }
    try {
      if (req.method === 'GET' && req.url === '/health') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(metadata())); }
      if (req.method === 'GET' && req.url === '/stream') {
        if (viewers.size >= 2) { res.writeHead(409); return res.end(); }
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'X-Accel-Buffering': 'no' }); res.flushHeaders(); viewers.add(res);
        writeEvent(res, 'state', metadata());
        if (latestFrame) writeEvent(res, 'frame', latestFrame);
        if (dialog) writeEvent(res, 'dialog', { type: dialog.type(), message: dialog.message(), defaultValue: dialog.defaultValue() });
        const pulse = setInterval(() => { if (!res.destroyed) res.write(': heartbeat\n\n'); }, 15000);
        res.on('close', () => { clearInterval(pulse); viewers.delete(res); });
        const framePulse = setInterval(() => { if (latestFrame && !res.destroyed) writeEvent(res, 'frame', latestFrame); }, 1000);
        res.on('close', () => clearInterval(framePulse));
        current.screenshot({ type: 'jpeg', quality: 60, timeout: 5000 }).then((data) => { if (!latestFrame) latestFrame = { data: data.toString('base64'), width: WIDTH, height: HEIGHT }; if (!res.destroyed) writeEvent(res, 'frame', latestFrame); }).catch(() => {});
        return;
      }
      if (req.method === 'GET' && req.url === '/screenshot') {
        lastActivity = Date.now(); const buffer = await current.screenshot({ type: 'png', timeout: 10000 });
        res.setHeader('Content-Type', 'image/png'); return res.end(buffer);
      }
      if (req.method === 'POST' && req.url === '/input') {
        let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 200000) throw new Error('Gói thao tác quá lớn.'); }
        const events = validateInput(JSON.parse(raw).events);
        if (queuedInputs >= 8) { res.writeHead(429); return res.end(); }
        queuedInputs++; lastActivity = Date.now();
        const job = inputQueue.catch(() => {}).then(async () => { for (const event of events) await apply(event); }); inputQueue = job;
        try { await job; } finally { queuedInputs--; }
        res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(metadata()));
      }
      res.writeHead(404); res.end();
    } catch { res.writeHead(400); res.end(JSON.stringify({ error: 'Không thể thực hiện thao tác. Kiểm tra trang hoặc thử lại.' })); }
  });
  return { server, close, browser, metadata };
}

if (require.main === module) {
  createRuntime({ token: process.env.MANUAL_SESSION_TOKEN, targetUrl: process.env.MANUAL_TARGET_URL, onExpired: () => process.exit(0), idleMs: Number(process.env.MANUAL_IDLE_MS) || undefined })
    .then((runtime) => {
      runtime.server.listen(3101, '0.0.0.0');
      for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => runtime.close().finally(() => process.exit(0)));
    }).catch(() => { console.error('Manual browser could not start.'); process.exit(1); });
}
module.exports = { createRuntime };
