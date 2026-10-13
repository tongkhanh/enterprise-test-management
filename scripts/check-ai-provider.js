const assert = require('assert');

process.env.AI_PROVIDER = 'GoogleAI';
process.env.AI_MODEL = 'gemini-3.5-flash';
process.env.GEMINI_API_KEY = 'test-key-never-sent';
process.env.AI_EMBEDDING_PROVIDER = 'GoogleAI';
process.env.AI_EMBEDDING_MODEL = 'gemini-embedding-001';
process.env.AI_EMBEDDING_DIMENSIONS = '1536';

const calls = [];
global.fetch = async (url, options) => {
  calls.push({ url, options, body: JSON.parse(options.body) });
  if (url.includes(':embedContent')) {
    return {
      ok: true,
      json: async () => ({ embedding: { values: Array.from({ length: 1536 }, (_, index) => (index === 0 ? 1 : 0)) } }),
    };
  }
  return {
    ok: true,
    json: async () => ({
      model: 'gemini-3.5-flash',
      status: 'completed',
      steps: [{ type: 'model_output', content: [{ type: 'text', text: '{"testCases":[]}' }] }],
      usage: { total_input_tokens: 10, total_output_tokens: 5, total_tokens: 15 },
    }),
  };
};

const ai = require('../services/aiService');

(async () => {
  const status = ai.getAiStatus();
  assert.deepStrictEqual(
    { provider: status.provider, model: status.model, configured: status.configured },
    { provider: 'GoogleAI', model: 'gemini-3.5-flash', configured: true },
  );

  const completion = await ai.complete({
    prompt: 'Sinh test case',
    provider: 'OpenAI',
    model: 'gpt-4o-mini',
    json: true,
  });
  assert.strictEqual(completion.provider, 'GoogleAI');
  assert.strictEqual(completion.model, 'gemini-3.5-flash');
  assert.strictEqual(calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/interactions');
  assert.strictEqual(calls[0].options.headers['x-goog-api-key'], 'test-key-never-sent');
  assert.strictEqual(calls[0].body.model, 'gemini-3.5-flash');
  assert.strictEqual(calls[0].body.store, false);
  assert.strictEqual(calls[0].body.generation_config.thinking_level, 'low');
  assert.strictEqual(calls[0].body.response_format[0].mime_type, 'application/json');

  const embedding = await ai.createEmbedding('Nội dung bug');
  assert.strictEqual(embedding.provider, 'GoogleAI');
  assert.strictEqual(embedding.model, 'gemini-embedding-001');
  assert.strictEqual(embedding.vector.length, 1536);
  assert.strictEqual(calls[1].body.embedContentConfig.outputDimensionality, 1536);
  assert.strictEqual(calls[1].options.headers['x-goog-api-key'], 'test-key-never-sent');

  delete process.env.GEMINI_API_KEY;
  await assert.rejects(
    () => ai.complete({ prompt: 'Kiểm tra cấu hình' }),
    (error) => error.statusCode === 503 && error.message.includes('GEMINI_API_KEY'),
  );

  console.log('OK: AI Core mặc định dùng Gemini 3.5 Flash Interactions API và Gemini Embedding, không gọi OpenAI.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
