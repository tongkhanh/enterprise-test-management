const crypto = require('node:crypto');

const deriveKey = () => crypto.createHash('sha256')
  .update(process.env.INTEGRATION_ENCRYPTION_KEY || process.env.JWT_SECRET || 'etms-development-only')
  .digest();

const encryptCredential = (value) => {
  if (!value) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join(':');
};

const decryptCredential = (payload) => {
  if (!payload) return null;
  const [version, iv, tag, encrypted] = String(payload).split(':');
  if (version !== 'v1' || !iv || !tag || !encrypted) throw new Error('Credential payload không hợp lệ.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
};

module.exports = { encryptCredential, decryptCredential };
