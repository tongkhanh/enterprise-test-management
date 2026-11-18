const test = require('node:test');
const assert = require('node:assert/strict');
const ai = require('../../services/aiService');
async function fakeRequest(fetch, run) {
  const originalFetch = global.fetch;
  const names = ['GEMINI_API_KEY', 'AI_PROVIDER', 'AI_REQUEST_TIMEOUT_MS', 'AI_GEMINI_RETRY_COUNT', 'AI_GEMINI_RETRY_BASE_MS'];
  const previous = names.map((key) => process.env[key]);
  global.fetch = fetch;
  process.env.GEMINI_API_KEY = 'test-key-never-sent'; process.env.AI_PROVIDER = 'GoogleAI'; process.env.AI_REQUEST_TIMEOUT_MS = '10'; process.env.AI_GEMINI_RETRY_COUNT = '2'; process.env.AI_GEMINI_RETRY_BASE_MS = '0';
  try { await run(); } finally { global.fetch = originalFetch; names.forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i]; }); }
}
test('Gemini connection cannot leave a generation pending indefinitely', async () => {
  await fakeRequest((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')))), async () => {
    await assert.rejects(ai.complete({ prompt: 'test' }), (error) => error.statusCode === 504 && /quá lâu/.test(error.message));
  });
});
test('timeout also bounds a stalled response body after headers arrive', async () => {
  await fakeRequest(async (_url, options) => ({ ok: true, json: () => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('body stalled')))) }), async () => {
    await assert.rejects(ai.complete({ prompt: 'test' }), (error) => error.statusCode === 504);
  });
});
test('quota errors keep their HTTP status and are not mislabeled as timeouts', async () => {
  await fakeRequest(async () => ({ ok: false, status: 429, json: async () => ({ error: { message: 'quota exhausted' } }) }), async () => {
    await assert.rejects(ai.complete({ prompt: 'test' }), (error) => error.statusCode === 429 && ai.isGeminiQuotaExhausted(error));
  });
});
test('temporary Gemini 503 responses are retried before succeeding', async () => {
  let calls = 0;
  await fakeRequest(async () => {
    calls += 1;
    if (calls < 3) return { ok: false, status: 503, headers: { get: () => null }, json: async () => ({ error: { message: 'high demand, try again later' } }) };
    return { ok: true, json: async () => ({ steps: [{ type: 'model_output', content: [{ type: 'text', text: '{"ok":true}' }] }] }) };
  }, async () => {
    const result = await ai.complete({ prompt: 'test', json: true });
    assert.equal(calls, 3);
    assert.match(result.text, /"ok":true/);
  });
});
test('temporary Gemini 503 preserves a service-unavailable error after retries', async () => {
  let calls = 0;
  await fakeRequest(async () => {
    calls += 1;
    return { ok: false, status: 503, headers: { get: () => null }, json: async () => ({ error: { message: 'high demand, try again later' } }) };
  }, async () => {
    await assert.rejects(ai.complete({ prompt: 'test' }), (error) => error.statusCode === 503 && /3 lần thử/.test(error.message));
    assert.equal(calls, 3);
  });
});
