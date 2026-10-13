const crypto = require('node:crypto');
const { IntegrationConnection, WebhookDelivery, TestEnvironment, Bug, IntegrationSyncLog } = require('../models');
const { decryptCredential } = require('../services/integrationCredentialService');
const { createEnvironmentBuild } = require('../services/environmentService');
const { AppError, send } = require('../utils/http');

const equal = (a, b) => { const x = Buffer.from(String(a || '')); const y = Buffer.from(String(b || '')); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const raw = (req) => req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
async function connectionWithSecret(id, provider) { const item = await IntegrationConnection.findById(id).select('+webhookSecretCiphertext'); if (!item || item.provider !== provider) throw new AppError(`${provider} integration không tồn tại.`, 404); return item; }

async function github(req, res) {
  const connection = await connectionWithSecret(req.params.integrationId, 'GitHub'); const secret = decryptCredential(connection.webhookSecretCiphertext);
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(raw(req)).digest('hex')}`;
  if (!equal(expected, req.headers['x-hub-signature-256'])) throw new AppError('GitHub webhook signature không hợp lệ.', 401);
  const deliveryId = req.headers['x-github-delivery']; const event = req.headers['x-github-event'] || 'unknown'; if (!deliveryId) throw new AppError('Thiếu X-GitHub-Delivery.', 400);
  let delivery;
  try { delivery = await WebhookDelivery.create({ integration: connection._id, provider: 'GitHub', deliveryId, event, payloadHash: crypto.createHash('sha256').update(raw(req)).digest('hex'), status: 'Processing' }); }
  catch (error) { if (error.code === 11000) return send(res, { duplicate: true }, 202); throw error; }
  try {
    const repo = req.body.repository?.full_name; const builds = [];
    if (event === 'push' && repo) {
      const ref = String(req.body.ref || '').replace('refs/heads/', '');
      const envs = await TestEnvironment.find({ integration: connection._id, 'repository.fullName': repo, autoBuildOnPush: true });
      for (const env of envs) builds.push(await createEnvironmentBuild({ environment: env, source: 'Push', ref, commitSha: req.body.after, requestedBy: env.createdBy }));
    } else if (event === 'pull_request' && ['opened', 'reopened', 'synchronize'].includes(req.body.action)) {
      const pr = req.body.pull_request; const envs = await TestEnvironment.find({ integration: connection._id, 'repository.fullName': repo, autoBuildOnPullRequest: true });
      for (const env of envs) builds.push(await createEnvironmentBuild({ environment: env, source: 'PullRequest', ref: pr.head.ref, commitSha: pr.head.sha, pullRequestNumber: req.body.number, requestedBy: env.createdBy }));
    }
    delivery.status = builds.length ? 'Processed' : 'Ignored'; delivery.processedAt = new Date(); await delivery.save(); send(res, { accepted: true, builds: builds.map((x) => x._id) }, 202);
  } catch (error) { delivery.status = 'Failed'; delivery.error = error.message; await delivery.save(); throw error; }
}

async function jira(req, res) {
  const connection = await connectionWithSecret(req.params.integrationId, 'Jira'); const secret = decryptCredential(connection.webhookSecretCiphertext);
  if (!equal(secret, req.headers['x-etms-webhook-secret'])) throw new AppError('Jira webhook secret không hợp lệ.', 401);
  const deliveryId = req.headers['x-atlassian-webhook-identifier'] || crypto.createHash('sha256').update(raw(req)).digest('hex'); const event = req.body.webhookEvent || 'jira:unknown';
  try { await WebhookDelivery.create({ integration: connection._id, provider: 'Jira', deliveryId, event, payloadHash: crypto.createHash('sha256').update(raw(req)).digest('hex'), status: 'Processing' }); }
  catch (error) { if (error.code === 11000) return send(res, { duplicate: true }, 202); throw error; }
  const issue = req.body.issue; const bug = issue?.key ? await Bug.findOne({ project: connection.project, 'externalIssue.key': issue.key }) : null;
  if (bug) {
    const fields = issue.fields || {}; const statusMap = connection.syncConfig?.statusMappings || {};
    if (fields.status?.name && statusMap[fields.status.name]) bug.status = statusMap[fields.status.name];
    bug.externalIssue = { ...(bug.externalIssue?.toObject?.() || bug.externalIssue || {}), provider: 'Jira', key: issue.key, id: issue.id, url: `${connection.baseUrl}/browse/${issue.key}`, status: fields.status?.name, assignee: fields.assignee?.displayName, resolution: fields.resolution?.name, syncedAt: new Date() };
    if (req.body.comment?.body) bug.comments = [...(bug.comments || []), { body: typeof req.body.comment.body === 'string' ? req.body.comment.body : JSON.stringify(req.body.comment.body), source: 'Jira', externalId: req.body.comment.id, createdAt: new Date() }];
    await bug.save({ validateBeforeSave: false });
  }
  await WebhookDelivery.findOneAndUpdate({ integration: connection._id, deliveryId }, { status: bug ? 'Processed' : 'Ignored', processedAt: new Date() });
  await IntegrationSyncLog.create({ integration: connection._id, project: connection.project, provider: 'Jira', direction: 'Inbound', action: event, status: 'Success', externalEntity: { type: 'Issue', id: issue?.id || '', key: issue?.key || '' }, message: bug ? 'Đã đồng bộ Jira về ETMS.' : 'Không tìm thấy Bug tương ứng.' });
  send(res, { accepted: true, updatedBug: bug?._id || null }, 202);
}
module.exports = { github, jira };
