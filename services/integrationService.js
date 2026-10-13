const crypto = require('node:crypto');
const { IntegrationConnection, IntegrationSyncLog } = require('../models');
const { AppError } = require('../utils/http');
const { decryptCredential, encryptCredential } = require('./integrationCredentialService');
const { createIntegrationProvider } = require('./integrations');

const safeError = (error) => String(error?.message || 'Integration error').replace(/(bearer|token|password|secret)\s+[^\s,;]+/ig, '$1 [REDACTED]').slice(0, 1000);

const testIntegrationConnection = async ({ integrationId, user }) => {
  const startedAt = Date.now();
  const connection = await IntegrationConnection.findById(integrationId).select('+credentialCiphertext');
  if (!connection) throw new AppError('Integration không tồn tại.', 404);
  let log;
  try {
    const provider = createIntegrationProvider({ connection, credential: decryptCredential(connection.credentialCiphertext) });
    const result = await provider.testConnection();
    connection.status = 'Connected';
    connection.lastTestedAt = new Date();
    connection.lastError = '';
    await connection.save({ validateBeforeSave: false });
    log = await IntegrationSyncLog.create({
      integration: connection._id, project: connection.project, provider: connection.provider,
      action: 'TestConnection', status: 'Success', durationMs: Date.now() - startedAt,
      message: `Connected as ${result.identity || 'authorized account'}`, initiatedBy: user._id,
    });
    return { connection, result, log };
  } catch (error) {
    connection.status = 'Error';
    connection.lastTestedAt = new Date();
    connection.lastError = safeError(error);
    await connection.save({ validateBeforeSave: false });
    log = await IntegrationSyncLog.create({
      integration: connection._id, project: connection.project, provider: connection.provider,
      action: 'TestConnection', status: 'Failed', durationMs: Date.now() - startedAt,
      error: safeError(error), initiatedBy: user._id,
    });
    error.integrationLogId = log._id;
    throw error;
  }
};

const rotateWebhookSecret = async (connection) => {
  const secret = crypto.randomBytes(32).toString('base64url');
  connection.webhookSecretCiphertext = encryptCredential(secret);
  connection.hasWebhookSecret = true;
  await connection.save({ validateBeforeSave: false });
  return secret;
};

module.exports = { testIntegrationConnection, rotateWebhookSecret, safeError };
