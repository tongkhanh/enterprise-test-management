const crypto = require('node:crypto');
const { Bug, IntegrationConnection, IntegrationSyncLog } = require('../models');
const { decryptCredential } = require('./integrationCredentialService');
const { createIntegrationProvider } = require('./integrations');

async function enqueueJiraBugSync({ bugId, comment, userId }) {
  const bug = await Bug.findById(bugId); if (!bug?.externalIssue?.key) return null;
  const connection = await IntegrationConnection.findOne({ provider: 'Jira', project: bug.project, status: 'Connected', ...(bug.externalIssue.integration ? { _id: bug.externalIssue.integration } : {}) }).sort({ lastTestedAt: -1, updatedAt: -1, _id: -1 }); if (!connection) return null;
  const data = { bugId, integrationId: connection._id, comment, userId }; const job = await require('./queueService').enqueueIntegration('jira-bug-sync', data, { attempts: connection.retryPolicy?.maxAttempts || 3, backoff: { type: 'exponential', delay: connection.retryPolicy?.backoffMs || 1000 } });
  if (!job) setImmediate(() => processIntegrationJob({ name: 'jira-bug-sync', data, attemptsMade: 0 }).catch(console.error));
  return job;
}
async function processIntegrationJob(job) {
  if (job.name !== 'jira-bug-sync') throw new Error(`Integration job không hỗ trợ: ${job.name}`);
  const started = Date.now(); const connection = await IntegrationConnection.findById(job.data.integrationId).select('+credentialCiphertext'); const bug = await Bug.findById(job.data.bugId).populate('assignedTo', 'email fullName');
  if (!connection || !bug || !bug.externalIssue?.key) throw new Error('Thiếu Integration/Bug/Jira key.');
  if (connection.provider !== 'Jira' || connection.status !== 'Connected' || String(connection.project) !== String(bug.project) || (bug.externalIssue.integration && String(bug.externalIssue.integration) !== String(connection._id))) throw new Error('Jira connection không khớp với Project/Issue hoặc không còn Connected.');
  const log = await IntegrationSyncLog.create({ integration: connection._id, project: bug.project, provider: 'Jira', direction: 'Outbound', action: 'SyncBug', status: 'Retrying', attempt: job.attemptsMade + 1, externalEntity: { type: 'Issue', key: bug.externalIssue.key }, payloadHash: crypto.createHash('sha256').update(`${bug.updatedAt}:${bug.status}`).digest('hex'), initiatedBy: job.data.userId });
  try {
    const provider = createIntegrationProvider({ connection, credential: decryptCredential(connection.credentialCiphertext) });
    const assigneeId = connection.settings?.userMappings?.[bug.assignedTo?.email]; const fields = { summary: bug.title, priority: { name: bug.priority } }; if (assigneeId) fields.assignee = { accountId: assigneeId };
    await provider.updateIssue(bug.externalIssue.key, fields);
    const target = connection.syncConfig?.statusMappings?.[bug.status] || bug.status;
    const transition = await provider.transitionIssue(bug.externalIssue.key, target);
    if (transition?.skipped) throw new Error(transition.reason || 'Jira status transition chưa hoàn tất.');
    if (job.data.comment) await provider.addComment(bug.externalIssue.key, job.data.comment);
    log.status = 'Success'; log.durationMs = Date.now() - started; log.message = `Đã đồng bộ ETMS Bug sang Jira. Trạng thái: ${transition?.status || target}.`; connection.lastSyncAt = new Date(); await Promise.all([log.save(), connection.save()]); return { bugId: bug._id, key: bug.externalIssue.key };
  } catch (error) { log.status = 'Failed'; log.error = error.message.slice(0, 1000); log.message = 'Đồng bộ chưa hoàn tất; một số trường có thể đã được cập nhật.'; log.durationMs = Date.now() - started; await log.save(); throw error; }
}
module.exports = { enqueueJiraBugSync, processIntegrationJob };
