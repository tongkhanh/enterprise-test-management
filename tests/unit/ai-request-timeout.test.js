const test = require('node:test');
const assert = require('node:assert/strict');
const ai = require('../../services/aiService');
async function fakeRequest(fetch, run) {
  const originalFetch = global.fetch;
  const names = ['GEMINI_API_KEY', 'AI_PROVIDER', 'AI_REQUEST_TIMEOUT_MS'];
  const previous = names.map((key) => process.env[key]);
  global.fetch = fetch;
  process.env.GEMINI_API_KEY = 'test-key-never-sent'; process.env.AI_PROVIDER = 'GoogleAI'; process.env.AI_REQUEST_TIMEOUT_MS = '10';
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
