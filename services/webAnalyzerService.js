const dns = require('node:dns').promises;
const fs = require('node:fs');
const fsp = require('node:fs').promises;
const net = require('node:net');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { chromium } = require('playwright');
const { AppError } = require('../utils/http');

const ARTIFACT_ROOT = path.join(__dirname, '..', 'storage', 'web-analysis');
const MAX_CONCURRENT_ANALYSES = Math.max(1, Number(process.env.WEB_ANALYZER_MAX_CONCURRENCY || 2));
let activeAnalyses = 0;
let lastArtifactCleanup = 0;

const isTruthy = (value) => ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());

const isPrivateIpv4 = (ip) => {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b, c] = parts;
  return a === 0 || a === 10 || a === 127 ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) ||
    (a === 192 && b === 0 && c === 0) || (a === 192 && b === 0 && c === 2) ||
    (a === 198 && (b === 18 || b === 19)) || (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) || a >= 224;
};

const isPrivateIpv6 = (ip) => {
  const value = ip.toLowerCase().split('%')[0];
  if (value === '::' || value === '::1') return true;
  if (value.startsWith('fc') || value.startsWith('fd') || /^fe[89ab]/.test(value)) return true;
  if (value.startsWith('::ffff:')) {
    const mapped = value.slice(7);
    return net.isIP(mapped) === 4 ? isPrivateIpv4(mapped) : true;
  }
  return false;
};

const isPrivateAddress = (address) => {
  const version = net.isIP(address);
  return version === 4 ? isPrivateIpv4(address) : version === 6 ? isPrivateIpv6(address) : true;
};

const hostAllowedByPolicy = (hostname) => {
  const configured = String(process.env.WEB_ANALYZER_ALLOWED_HOSTS || '')
    .split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
  if (!configured.length) return true;
  return configured.some((entry) => {
    if (entry.startsWith('*.')) return hostname === entry.slice(2) || hostname.endsWith(`.${entry.slice(2)}`);
    return hostname === entry;
  });
};

const validateTargetUrl = async (rawUrl, options = {}) => {
  let url;
  try { url = new URL(rawUrl); } catch (_) { throw new AppError('URL website không hợp lệ.', 400); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new AppError('Web Analyzer chỉ hỗ trợ URL HTTP hoặc HTTPS.', 400);
  if (url.username || url.password) throw new AppError('Không đặt tài khoản hoặc mật khẩu trực tiếp trong URL.', 400);
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!hostname || hostname.length > 253) throw new AppError('Hostname không hợp lệ.', 400);
  if (!hostAllowedByPolicy(hostname)) throw new AppError(`Domain ${hostname} không nằm trong WEB_ANALYZER_ALLOWED_HOSTS.`, 403);

  const allowPrivate = options.allowPrivate ?? isTruthy(process.env.WEB_ANALYZER_ALLOW_PRIVATE);
  const reservedNames = hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal');
  const metadataHosts = new Set(['metadata.google.internal', 'metadata.azure.com', '169.254.169.254', '100.100.100.200']);
  if (metadataHosts.has(hostname)) throw new AppError('Không được phép phân tích địa chỉ metadata của hạ tầng.', 403);
  if (!allowPrivate && reservedNames) throw new AppError('URL nội bộ/localhost đang bị chặn. Chỉ bật WEB_ANALYZER_ALLOW_PRIVATE trong môi trường phát triển tin cậy.', 403);

  let addresses;
  if (net.isIP(hostname)) addresses = [{ address: hostname }];
  else {
    try { addresses = await dns.lookup(hostname, { all: true, verbatim: true }); }
    catch (_) { throw new AppError(`Không phân giải được domain ${hostname}.`, 400); }
  }
  if (!addresses.length) throw new AppError(`Domain ${hostname} không có địa chỉ IP.`, 400);
  if (!allowPrivate && addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new AppError('URL trỏ tới mạng riêng, loopback hoặc địa chỉ dành riêng nên đã bị chặn.', 403);
  }
  url.hash = '';
  return url;
};

const cleanUrlForLog = (rawUrl) => {
  try {
    const url = new URL(rawUrl);
    url.username = ''; url.password = ''; url.search = ''; url.hash = '';
    return url.toString();
  } catch (_) { return String(rawUrl).slice(0, 500); }
};

const findBrowserExecutable = () => {
  if (process.env.WEB_ANALYZER_BROWSER_EXECUTABLE) return process.env.WEB_ANALYZER_BROWSER_EXECUTABLE;
  if (process.platform !== 'win32') return undefined;
  return [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ].find((candidate) => fs.existsSync(candidate));
};

const cleanupExpiredArtifacts = async () => {
  if (Date.now() - lastArtifactCleanup < 60 * 60 * 1000) return;
  lastArtifactCleanup = Date.now();
  const ttlHours = Math.min(Math.max(Number(process.env.WEB_ANALYZER_ARTIFACT_TTL_HOURS) || 24, 1), 168);
  const cutoff = Date.now() - ttlHours * 60 * 60 * 1000;
  await fsp.mkdir(ARTIFACT_ROOT, { recursive: true });
  const entries = await fsp.readdir(ARTIFACT_ROOT, { withFileTypes: true });
  await Promise.all(entries.filter((entry) => entry.isFile() && entry.name.endsWith('.jpg')).map(async (entry) => {
    const artifactPath = path.join(ARTIFACT_ROOT, entry.name);
    const stat = await fsp.stat(artifactPath);
    if (stat.mtimeMs < cutoff) await fsp.unlink(artifactPath);
  }));
};

const extractPageStructure = (page) => page.evaluate(() => {
  const trim = (value, max = 500) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
  const visible = (element) => {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity || 1) !== 0 && rect.width > 0 && rect.height > 0;
  };
  const labelFor = (element) => {
    const explicit = element.id ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`) : null;
    const wrapping = element.closest('label');
    return trim(element.getAttribute('aria-label') || element.getAttribute('aria-labelledby')?.split(/\s+/).map((id) => document.getElementById(id)?.textContent).join(' ') || explicit?.textContent || wrapping?.textContent || element.getAttribute('placeholder') || element.getAttribute('name'));
  };
  const locatorFor = (element) => {
    const testId = element.getAttribute('data-testid') || element.getAttribute('data-test') || element.getAttribute('data-cy');
    if (testId) return { strategy: 'testId', value: trim(testId, 200) };
    const role = element.getAttribute('role') || ({ BUTTON: 'button', A: 'link', SELECT: 'combobox', TEXTAREA: 'textbox' }[element.tagName]) || (element.tagName === 'INPUT' && ['button', 'submit', 'reset'].includes(element.type) ? 'button' : element.tagName === 'INPUT' ? 'textbox' : null);
    const name = labelFor(element) || trim(element.textContent || element.getAttribute('value'), 200);
    if (role && name) return { strategy: 'role', role, name };
    if (element.id) return { strategy: 'css', value: `#${CSS.escape(element.id)}` };
    if (element.getAttribute('name')) return { strategy: 'css', value: `${element.tagName.toLowerCase()}[name="${CSS.escape(element.getAttribute('name'))}"]` };
    return null;
  };
  const inputs = [...document.querySelectorAll('input, textarea, select')].filter(visible).slice(0, 120).map((element) => ({
    tag: element.tagName.toLowerCase(), type: element.getAttribute('type') || element.tagName.toLowerCase(), name: trim(element.getAttribute('name'), 200),
    label: labelFor(element), placeholder: trim(element.getAttribute('placeholder'), 300), required: element.required,
    disabled: element.disabled, readOnly: element.readOnly, autocomplete: trim(element.getAttribute('autocomplete'), 100),
    pattern: trim(element.getAttribute('pattern'), 200), minLength: element.minLength > -1 ? element.minLength : null,
    maxLength: element.maxLength > -1 ? element.maxLength : null, min: element.getAttribute('min'), max: element.getAttribute('max'),
    options: element.tagName === 'SELECT' ? [...element.options].slice(0, 50).map((option) => ({ label: trim(option.textContent, 200), value: trim(option.value, 200), disabled: option.disabled })) : undefined,
    locator: locatorFor(element),
  }));
  const buttons = [...document.querySelectorAll('button, input[type="submit"], input[type="button"], [role="button"]')].filter(visible).slice(0, 100).map((element) => ({
    text: trim(element.textContent || element.getAttribute('value'), 300), type: element.getAttribute('type') || 'button', disabled: Boolean(element.disabled), locator: locatorFor(element),
  }));
  const links = [...document.querySelectorAll('a[href]')].filter(visible).slice(0, 200).map((element) => ({ text: trim(element.textContent, 300), href: trim(element.href, 1000), locator: locatorFor(element) }));
  const forms = [...document.querySelectorAll('form')].filter(visible).slice(0, 30).map((form) => ({
    name: trim(form.getAttribute('name') || form.getAttribute('aria-label') || form.id, 200), method: (form.method || 'get').toUpperCase(), action: trim(form.action, 1000),
    inputNames: [...form.querySelectorAll('input, textarea, select')].slice(0, 50).map((field) => trim(field.getAttribute('name') || labelFor(field), 200)).filter(Boolean),
  }));
  const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]')].filter(visible).slice(0, 100).map((element) => ({ level: Number(element.getAttribute('aria-level')) || Number(element.tagName.slice(1)) || null, text: trim(element.textContent, 500) }));
  const landmarks = [...document.querySelectorAll('main,nav,header,footer,aside,[role="main"],[role="navigation"],[role="dialog"],[role="alert"]')].filter(visible).slice(0, 60).map((element) => ({ role: element.getAttribute('role') || element.tagName.toLowerCase(), label: trim(element.getAttribute('aria-label') || element.getAttribute('aria-labelledby') || '', 300), text: trim(element.textContent, 500) }));
  const meta = [...document.querySelectorAll('meta[name],meta[property]')].slice(0, 50).map((element) => ({ name: trim(element.getAttribute('name') || element.getAttribute('property'), 200), content: trim(element.content, 500) }));
  return {
    title: trim(document.title, 500), lang: document.documentElement.lang || null,
    description: meta.find((item) => item.name === 'description')?.content || null,
    headings, forms, inputs, buttons, links, landmarks,
    visibleText: trim(document.body?.innerText, 12000),
    counts: { forms: document.forms.length, inputs: document.querySelectorAll('input,textarea,select').length, buttons: document.querySelectorAll('button,input[type="submit"],input[type="button"],[role="button"]').length, links: document.links.length },
  };
});

const analyzeWebPage = async ({ targetUrl, viewport, userAgent, artifactNamespace = 'anonymous', allowPrivate = false }) => {
  if (activeAnalyses >= MAX_CONCURRENT_ANALYSES) throw new AppError('Web Analyzer đang bận. Vui lòng thử lại sau.', 429);
  activeAnalyses += 1;
  const analysisId = randomUUID();
  let browser;
  try {
    const validatedUrl = await validateTargetUrl(targetUrl, { allowPrivate });
    const trustedOrigin = allowPrivate ? validatedUrl.origin : null;
    const executablePath = findBrowserExecutable();
    browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    const width = Math.min(Math.max(Number(viewport?.width) || 1440, 320), 2560);
    const height = Math.min(Math.max(Number(viewport?.height) || 900, 320), 1600);
    const context = await browser.newContext({
      viewport: { width, height }, ignoreHTTPSErrors: isTruthy(process.env.WEB_ANALYZER_IGNORE_HTTPS_ERRORS),
      locale: 'vi-VN', ...(userAgent ? { userAgent: String(userAgent).slice(0, 500) } : {}),
    });
    context.setDefaultTimeout(Math.min(Math.max(Number(process.env.WEB_ANALYZER_ACTION_TIMEOUT_MS) || 10000, 1000), 30000));
    context.setDefaultNavigationTimeout(Math.min(Math.max(Number(process.env.WEB_ANALYZER_NAVIGATION_TIMEOUT_MS) || 30000, 3000), 60000));

    const consoleMessages = []; const pageErrors = []; const failedRequests = []; const httpErrors = [];
    const pushLimited = (array, value, limit = 50) => { if (array.length < limit) array.push(value); };
    const validationCache = new Map();
    const validateRequestUrl = (requestUrl) => {
      const parsed = new URL(requestUrl);
      const cacheKey = `${parsed.protocol}//${parsed.host}`;
      if (!validationCache.has(cacheKey)) validationCache.set(cacheKey, trustedOrigin && parsed.origin === trustedOrigin ? Promise.resolve(parsed) : validateTargetUrl(requestUrl, { allowPrivate: false }));
      return validationCache.get(cacheKey);
    };
    await context.route('**/*', async (route) => {
      const requestUrl = route.request().url();
      if (/^(data|blob|about):/i.test(requestUrl)) return route.continue();
      try { await validateRequestUrl(requestUrl); return route.continue(); }
      catch (error) { pushLimited(failedRequests, { url: cleanUrlForLog(requestUrl), method: route.request().method(), reason: `Blocked: ${error.message}` }); return route.abort('blockedbyclient'); }
    });
    const page = await context.newPage();
    page.on('console', (message) => {
      if (['error', 'warning'].includes(message.type())) pushLimited(consoleMessages, { type: message.type(), text: message.text().slice(0, 2000), location: cleanUrlForLog(message.location()?.url || '') });
    });
    page.on('pageerror', (error) => pushLimited(pageErrors, { name: error.name, message: error.message.slice(0, 3000) }));
    page.on('requestfailed', (request) => pushLimited(failedRequests, { url: cleanUrlForLog(request.url()), method: request.method(), resourceType: request.resourceType(), reason: request.failure()?.errorText || 'Request failed' }));
    page.on('response', (response) => { if (response.status() >= 400) pushLimited(httpErrors, { url: cleanUrlForLog(response.url()), status: response.status(), statusText: response.statusText(), resourceType: response.request().resourceType() }); });

    const startedAt = Date.now();
    const response = await page.goto(validatedUrl.toString(), { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => null);
    const finalUrl = await validateTargetUrl(page.url(), { allowPrivate });
    const structure = await extractPageStructure(page);
    structure.links = structure.links.map((link) => ({ ...link, href: cleanUrlForLog(link.href) }));
    structure.forms = structure.forms.map((form) => ({ ...form, action: cleanUrlForLog(form.action) }));
    await cleanupExpiredArtifacts();
    const safeNamespace = String(artifactNamespace).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || 'anonymous';
    const screenshotFilename = `${safeNamespace}-${analysisId}.jpg`;
    await page.screenshot({ path: path.join(ARTIFACT_ROOT, screenshotFilename), type: 'jpeg', quality: 72, fullPage: false, animations: 'disabled' });
    await context.close();
    return {
      analysisId, analyzedAt: new Date().toISOString(), durationMs: Date.now() - startedAt,
      requestedUrl: cleanUrlForLog(validatedUrl.toString()), finalUrl: cleanUrlForLog(finalUrl.toString()),
      pageStatus: response?.status() || null, browser: 'chromium', viewport: { width, height },
      screenshotUrl: `/api/v1/ai/web-analysis/artifacts/${screenshotFilename}`,
      page: structure, diagnostics: { consoleMessages, pageErrors, failedRequests, httpErrors },
      limits: { maxInputs: 120, maxButtons: 100, maxLinks: 200, visibleTextCharacters: 12000 },
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (/Executable doesn't exist|browserType\.launch/i.test(error.message)) throw new AppError('Không tìm thấy Chromium/Chrome để chạy Web Analyzer. Hãy cấu hình WEB_ANALYZER_BROWSER_EXECUTABLE hoặc cài browser bằng Playwright.', 503);
    if (/Timeout/i.test(error.message)) throw new AppError(`Website phản hồi quá thời gian cho phép: ${error.message}`, 504);
    throw new AppError(`Không thể phân tích website: ${error.message}`, 502);
  } finally {
    if (browser) await browser.close().catch(() => null);
    activeAnalyses -= 1;
  }
};

const getArtifactPath = (filename) => {
  if (!/^[a-zA-Z0-9_-]+-[0-9a-f-]{36}\.jpg$/.test(filename)) throw new AppError('Tên artifact không hợp lệ.', 400);
  const resolved = path.resolve(ARTIFACT_ROOT, filename);
  if (!resolved.startsWith(`${path.resolve(ARTIFACT_ROOT)}${path.sep}`)) throw new AppError('Đường dẫn artifact không hợp lệ.', 400);
  return resolved;
};

module.exports = { analyzeWebPage, validateTargetUrl, cleanUrlForLog, isPrivateAddress, getArtifactPath, findBrowserExecutable };
