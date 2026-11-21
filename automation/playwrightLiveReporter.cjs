// Runs inside the isolated Playwright runner. Observes Chromium; never sends user input.
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('@playwright/test');
const directory = path.resolve('.etms-live');
const safeUrl = (value) => { try { const url = new URL(value); return `${url.origin}${url.pathname}`; } catch { return ''; } };
class LiveReporter {
  constructor() {
    this.state = { status: 'Preparing', activity: 'Khởi tạo Playwright', events: [], assertions: [], startedAt: new Date().toISOString(), liveAvailable: false };
    this.queue = Promise.resolve(); this.done = false; this.clients = new Set(); this.expectFailed = false;
    this.counts = { passed: 0, failed: 0, errors: 0, skipped: 0 };
  }
  async atomic(name, data) {
    await fs.mkdir(directory, { recursive: true });
    const temporary = path.join(directory, `${name}.tmp`);
    await fs.writeFile(temporary, data); await fs.rename(temporary, path.join(directory, name));
  }
  update(activity) {
    this.state.activity = activity; this.state.updatedAt = new Date().toISOString();
    this.state.events.push({ at: this.state.updatedAt, activity }); this.state.events = this.state.events.slice(-100);
    const json = JSON.stringify(this.state);
    this.queue = this.queue.catch(() => {}).then(() => this.atomic('state.json', json));
  }
  onBegin() {
    this.state.status = 'Running'; this.update('Đang khởi chạy trình duyệt');
    this.monitor = setInterval(() => this.connect().catch(() => {}), 500); this.monitor.unref();
  }
  async connect() {
    if (this.done || this.browser || this.connecting) return;
    this.connecting = true;
    try {
      const browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 1000 });
      if (this.done) { await browser.close(); return; }
      this.browser = browser;
      browser.on('disconnected', () => { this.browser = null; this.state.liveAvailable = false; });
      for (const context of browser.contexts()) {
        context.on('page', (page) => this.observe(page).catch(() => {}));
        for (const page of context.pages()) await this.observe(page);
      }
    } finally { this.connecting = false; }
  }
  async observe(page) {
    if (this.done) return;
    const client = await page.context().newCDPSession(page); this.clients.add(client);
    let last = 0;
    client.on('Page.screencastFrame', (frame) => {
      client.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => {});
      if (this.done || this.writingFrame || Date.now() - last < 150) return;
      this.writingFrame = true; last = Date.now();
      this.atomic('frame.jpg', Buffer.from(frame.data, 'base64')).catch(() => {}).finally(() => { this.writingFrame = false; });
    });
    page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) { this.state.url = safeUrl(page.url()); this.update('Trình duyệt đã điều hướng'); } });
    await client.send('Page.startScreencast', { format: 'jpeg', quality: 60, maxWidth: 1280, maxHeight: 800, everyNthFrame: 1 });
    this.state.liveAvailable = true; this.state.url = safeUrl(page.url()); this.update('Đã kết nối màn hình chỉ xem');
  }
  onTestBegin() { this.expectFailed = false; this.update('Bắt đầu Test Case'); }
  onStepBegin(_test, _result, step) {
    if (['pw:api', 'expect'].includes(step.category)) this.update(step.category === 'expect' ? 'Đang kiểm tra assertion' : `Đang thực hiện ${step.title.match(/^[\w.]+/)?.[0] || 'thao tác trình duyệt'}`);
  }
  onStepEnd(_test, _result, step) {
    if (step.category !== 'expect') return;
    if (step.error) this.expectFailed = true;
    this.state.assertions.push({ number: this.state.assertions.length + 1, status: step.error ? 'Failed' : 'Passed', duration: step.duration });
    this.state.assertions = this.state.assertions.slice(-100); this.update(step.error ? 'Assertion không khớp' : 'Assertion đạt');
  }
  onTestEnd(_test, result) {
    if (result.status === 'passed') this.counts.passed++;
    else if (result.status === 'skipped') this.counts.skipped++;
    else if (result.status === 'failed' && this.expectFailed) this.counts.failed++;
    else this.counts.errors++;
    this.update(`Test Case: ${result.status}`);
  }
  onError() { this.counts.errors++; this.update('Lỗi khởi tạo hoặc thực thi; cần QA triage'); }
  async onEnd(result) {
    this.done = true; clearInterval(this.monitor);
    this.state.counts = this.counts;
    this.state.status = this.counts.errors || result.status === 'interrupted' || result.status === 'timedout' ? 'Error' : this.counts.failed ? 'Failed' : this.counts.passed ? 'Passed' : 'Skipped';
    this.state.completedAt = new Date().toISOString(); this.update(`Hoàn tất: ${this.state.status}`);
    await this.queue;
    for (const client of this.clients) await client.detach().catch(() => {});
    await this.browser?.close().catch(() => {});
  }
}
module.exports = LiveReporter;
