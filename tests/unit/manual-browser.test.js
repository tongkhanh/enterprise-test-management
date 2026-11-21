const { test } = require('node:test');
const assert = require('node:assert/strict');
const { signRequest, verifyRequest, validateInput } = require('../../manual-browser/protocol');
const { createBroker } = require('../../manual-browser/broker');
const secret = 'isolated-manual-browser-tests';
const identity = { userId: 'aaaaaaaaaaaaaaaaaaaaaaaa', executionId: 'bbbbbbbbbbbbbbbbbbbbbbbb' };

test('private staging opt-in does not allow loopback, metadata aliases or control ports', async (t) => {
  const previous = process.env.WEB_ANALYZER_ALLOW_PRIVATE; process.env.WEB_ANALYZER_ALLOW_PRIVATE = 'true';
  t.after(() => { if (previous === undefined) delete process.env.WEB_ANALYZER_ALLOW_PRIVATE; else process.env.WEB_ANALYZER_ALLOW_PRIVATE = previous; });
  const dns = require('node:dns/promises'); let address = '169.254.169.254';
  t.mock.method(dns, 'lookup', async () => [{ address }]);
  const { validateBrowserUrl } = require('../../manual-browser/urlPolicy');
  await assert.rejects(validateBrowserUrl('http://metadata-alias.example.test/'), /metadata/);
  await assert.rejects(validateBrowserUrl('http://127.0.0.1/'), /loopback/);
  await assert.rejects(validateBrowserUrl('http://staging.example.test:3100/'), /điều khiển/);
  address = '192.168.10.20';
  assert.equal((await validateBrowserUrl('http://staging.example.test/')).hostname, 'staging.example.test');
});

test('broker requests bind identity, operation and body; browser JWTs cannot be used as broker credentials', () => {
  const request = { ...identity, method: 'POST', path: '/input', body: { events: [{ type: 'text', text: 'hello' }] } };
  const token = signRequest(request, secret);
  assert.deepEqual(verifyRequest(token, request, secret), identity);
  assert.throws(() => verifyRequest(token, { ...request, path: '/screenshot' }, secret));
  assert.throws(() => verifyRequest(token, { ...request, body: { events: [] } }, secret));
  const ordinary = require('jsonwebtoken').sign({ id: identity.userId }, secret);
  assert.throws(() => verifyRequest(ordinary, request, secret));
  for (const events of [[{ type: 'eval', code: 'process.exit()' }], [{ type: 'pointer', event: 'down', x: Infinity, y: 1 }], [{ type: 'text', text: 'x'.repeat(4097) }], Array(33).fill({ type: 'reload' })]) assert.throws(() => validateInput(events));
  assert.doesNotThrow(() => validateInput([{ type: 'text', text: 'Đăng nhập' }, { type: 'key', event: 'down', key: 'Enter' }]));
});

test('broker isolates owners, reuses reconnects, caps containers, reaps idle sessions and cleans failed starts', async (t) => {
  const realFetch = global.fetch; const options = []; const removed = []; let crashed = false;
  const docker = {
    listContainers: async () => [],
    createContainer: async (config) => { options.push(config); const id = options.length; return { start: async () => {}, inspect: async () => ({ NetworkSettings: { Networks: { 'etms-manual-browsers': { IPAddress: `172.30.0.${id}` } } } }), remove: async () => removed.push(id) }; },
  };
  t.mock.method(global, 'fetch', async (url, config) => { if (crashed && String(url).startsWith('http://172.30.0.2')) throw new Error('Browser crashed'); return String(url).startsWith('http://172.30.') ? new Response(JSON.stringify({ url: 'https://example.test/' }), { headers: { 'Content-Type': 'application/json' } }) : realFetch(url, config); });
  const broker = createBroker({ secret, docker, maxSessions: 2, validateUrl: async () => {} });
  const server = broker.app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(who, method, path, body, status = 200) {
    const response = await realFetch(base + path, { method, headers: { Authorization: `Bearer ${signRequest({ ...who, method, path, body }, secret)}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.equal(response.status, status); return response;
  }
  try {
    await Promise.all([request(identity, 'POST', '/session', { targetUrl: 'https://example.test/' }), request(identity, 'POST', '/session', { targetUrl: 'https://example.test/' })]);
    assert.equal(options.length, 1);
    assert.equal(options[0].HostConfig.ReadonlyRootfs, true);
    assert.deepEqual(options[0].HostConfig.CapDrop, ['ALL']);
    assert.ok(options[0].Env.every((entry) => !/JWT_SECRET|MONGODB_URI|SMTP_PASS/.test(entry)));
    const other = { ...identity, userId: 'cccccccccccccccccccccccc' };
    await request(other, 'GET', '/session', undefined, 404);
    await request(other, 'POST', '/session', { targetUrl: 'https://example.test/' });
    assert.equal(options.length, 2);
    assert.notEqual(options[0].Env[0], options[1].Env[0]);
    await request({ ...identity, executionId: 'dddddddddddddddddddddddd' }, 'POST', '/session', { targetUrl: 'https://example.test/' }, 409);
    crashed = true;
    await request(other, 'POST', '/session', { targetUrl: 'https://example.test/' });
    assert.equal(options.length, 3, 'reconnecting replaces a dead browser instead of returning a stale session');
    await request(identity, 'DELETE', '/session');
    await request(identity, 'GET', '/session', undefined, 404);
    for (const session of broker.sessions.values()) session.lastActivity = Date.now() - 16 * 60 * 1000;
    await broker.reap(); assert.equal(broker.sessions.size, 0); assert.equal(removed.length, 3);
    t.mock.method(docker, 'createContainer', async () => ({ start: async () => { throw new Error('start failure'); }, remove: async () => removed.push('failed') }));
    await request(identity, 'POST', '/session', { targetUrl: 'https://example.test/' }, 503);
    assert.ok(removed.includes('failed'));
  } finally { await broker.close(); await new Promise((resolve) => server.close(resolve)); }
});
