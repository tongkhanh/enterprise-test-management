const assert = require('node:assert/strict');
const { sanitizeAuditValue } = require('../middleware/error');

const source = {
  email: 'qa@example.test',
  accessToken: 'top-secret-token',
  inviteUrl: 'http://localhost/accept?token=secret',
  nested: { webhookSecret: 'webhook-plain', credentialCiphertext: 'encrypted', safe: 'visible' },
};
const sanitized = sanitizeAuditValue(source);
assert.equal(sanitized.email, source.email);
assert.equal(sanitized.accessToken, '[REDACTED]');
assert.equal(sanitized.inviteUrl, '[REDACTED]');
assert.equal(sanitized.nested.webhookSecret, '[REDACTED]');
assert.equal(sanitized.nested.credentialCiphertext, '[REDACTED]');
assert.equal(sanitized.nested.safe, 'visible');
console.log('OK: Audit Log redacts invitation, token, credential và webhook secret.');
