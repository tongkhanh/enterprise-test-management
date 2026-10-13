const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const models = require('../../models');
const { encryptCredential, decryptCredential } = require('../../services/integrationCredentialService');
const { github } = require('../../controllers/webhookController');
test('credential encryption is randomized, authenticated and reversible', () => {
  const a = encryptCredential('private-value'); const b = encryptCredential('private-value');
  assert.notEqual(a, b); assert.equal(decryptCredential(a), 'private-value');
  assert.throws(() => decryptCredential(a.replace(/^v1/, 'v2')));
});
test('GitHub signature verifies original bytes and rejects tampering', async () => {
  const original = models.IntegrationConnection.findById;
  models.IntegrationConnection.findById = () => ({ select: async () => ({ provider: 'GitHub', webhookSecretCiphertext: encryptCredential('webhook-test-secret') }) });
  try {
    const body = Buffer.from('{ "repository": {} }');
    const signature = 'sha256=' + crypto.createHmac('sha256', 'webhook-test-secret').update(body).digest('hex');
    const request = { params: { integrationId: 'test' }, rawBody: body, body: { repository: {} }, headers: { 'x-hub-signature-256': signature } };
    await assert.rejects(github(request, {}), /X-GitHub-Delivery/); // Signature passed; missing delivery rejected next.
    await assert.rejects(github({ ...request, rawBody: Buffer.from('{}') }, {}), /signature/);
    await assert.rejects(github({ ...request, headers: {} }, {}), /signature/);
  } finally { models.IntegrationConnection.findById = original; }
});
