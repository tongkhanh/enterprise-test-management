const fs = require('node:fs').promises;
const path = require('node:path');
const { AppError } = require('../utils/http');

const configuration = () => ({
  baseUrl: String(process.env.JIRA_BASE_URL || '').replace(/\/+$/, ''),
  email: process.env.JIRA_EMAIL || '', token: process.env.JIRA_API_TOKEN || '',
  projectKey: process.env.JIRA_PROJECT_KEY || '', issueType: process.env.JIRA_ISSUE_TYPE || 'Bug',
});

const getJiraStatus = () => {
  const config = configuration();
  return {
    configured: Boolean(config.baseUrl && config.email && config.token && config.projectKey),
    baseUrl: config.baseUrl || null, projectKey: config.projectKey || null, issueType: config.issueType,
    missing: [!config.baseUrl && 'JIRA_BASE_URL', !config.email && 'JIRA_EMAIL', !config.token && 'JIRA_API_TOKEN', !config.projectKey && 'JIRA_PROJECT_KEY'].filter(Boolean),
  };
};

const assertConfiguration = () => {
  const status = getJiraStatus();
  if (!status.configured) throw new AppError(`Jira chưa được cấu hình: ${status.missing.join(', ')}.`, 503);
  const config = configuration();
  let url;
  try { url = new URL(config.baseUrl); } catch { throw new AppError('JIRA_BASE_URL không hợp lệ.', 500); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new AppError('JIRA_BASE_URL phải là HTTPS và không chứa thông tin đăng nhập.', 500);
  return config;
};

// Project Bugs use the encrypted connection verified in Settings. Never fall
// back to a server-wide account/project when that project has no connection.
const projectConfiguration = async (project) => {
  if (!project) return assertConfiguration();
  const { IntegrationConnection } = require('../models');
  const connection = await IntegrationConnection.findOne({ project, provider: 'Jira', status: 'Connected' })
    .sort({ lastTestedAt: -1, updatedAt: -1, _id: -1 }).select('+credentialCiphertext').lean();
  if (!connection) throw new AppError('Project chưa có kết nối Jira Connected. Mở Settings → Integrations và kiểm tra kết nối trước khi duyệt đồng bộ.', 409);
  const config = {
    baseUrl: String(connection.baseUrl || '').trim().replace(/\/+$/, ''),
    email: String(connection.settings?.accountEmail || '').trim(),
    token: require('./integrationCredentialService').decryptCredential(connection.credentialCiphertext),
    projectKey: String(connection.externalProjectKey || '').trim(),
    issueType: connection.settings?.issueType || 'Bug', integration: connection._id,
  };
  let url;
  try { url = new URL(config.baseUrl); } catch { throw new AppError('Base URL của kết nối Jira không hợp lệ.', 409); }
  if (url.protocol !== 'https:' || url.username || url.password || !config.email || !config.token || !config.projectKey) {
    throw new AppError('Kết nối Jira cần HTTPS Base URL, Jira account email, Access Token và Project/Repository Key.', 409);
  }
  return config;
};

const authHeaders = (config) => ({
  Authorization: `Basic ${Buffer.from(`${config.email}:${config.token}`).toString('base64')}`,
  Accept: 'application/json',
});

const jiraFetch = async (config, endpoint, options = {}) => {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`${config.baseUrl}${endpoint}`, { ...options, signal: controller.signal });
    const text = await response.text(); let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!response.ok) {
      const detail = String(data?.errors ? Object.values(data.errors).join('; ') : data?.errorMessages?.join('; ') || String(data || `HTTP ${response.status}`)).split(config.token).join('[REDACTED]');
      throw new AppError(`Jira trả lỗi ${response.status}: ${detail}`.slice(0, 1200), 502);
    }
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new AppError('Jira không phản hồi trong 20 giây.', 504);
    throw error;
  } finally { clearTimeout(timeout); }
};

const adfDocument = (sections) => ({
  type: 'doc', version: 1,
  content: sections.filter((section) => section.text).map((section) => ({
    type: 'paragraph', content: [{ type: 'text', text: `${section.title ? `${section.title}\n` : ''}${String(section.text).slice(0, 20000)}` }],
  })),
});

const uploadAttachments = async (config, issueKey, attachments = []) => {
  const uploaded = []; const warnings = [];
  for (const attachment of attachments.slice(0, 5)) {
    try {
      const stat = await fs.stat(attachment.path);
      if (!stat.isFile() || stat.size > 20 * 1024 * 1024) { warnings.push(`${attachment.name}: vượt giới hạn 20 MB.`); continue; }
      const bytes = await fs.readFile(attachment.path); const form = new FormData();
      form.append('file', new Blob([bytes], { type: attachment.type || 'application/octet-stream' }), path.basename(attachment.name));
      const result = await jiraFetch(config, `/rest/api/3/issue/${encodeURIComponent(issueKey)}/attachments`, {
        method: 'POST', headers: { ...authHeaders(config), 'X-Atlassian-Token': 'no-check' }, body: form,
      });
      uploaded.push(...(Array.isArray(result) ? result.map((item) => ({ id: item.id, filename: item.filename })) : []));
    } catch (error) { warnings.push(`${attachment.name}: ${error.message}`); }
  }
  return { uploaded, warnings };
};

const createJiraBug = async ({ project, initiatedBy, summary, rootCause, rootCauseSource = 'AI', confidence, severity, priority, environment, steps, evidence, targetUrl, attachments }) => {
  const config = await projectConfiguration(project);
  const startedAt = Date.now();
  const log = config.integration ? await require('../models').IntegrationSyncLog.create({ integration: config.integration, project, provider: 'Jira', direction: 'Outbound', action: 'CreateIssue', initiatedBy, status: 'Pending' }) : null;
  const saveLog = async (values) => {
    if (!log) return;
    Object.assign(log, values, { durationMs: Date.now() - startedAt });
    // A logging failure must not hide an issue that Jira already created.
    await log.save().catch(() => console.warn('Không thể cập nhật Jira CreateIssue log.'));
  };
  try {
    const description = adfDocument([
      { title: rootCauseSource === 'QA' ? 'Root cause do QA xác nhận' : 'Root cause có khả năng cao nhất', text: rootCause },
      { title: 'AI confidence', text: rootCauseSource === 'AI' ? `${Math.round((confidence || 0) * 100)}%` : '' },
      { title: 'Severity / Priority', text: `${severity || 'Major'} / ${priority || 'High'}` },
      { title: 'Environment', text: environment || 'Staging' },
      { title: 'Target URL', text: targetUrl || '' },
      { title: 'Steps to reproduce', text: steps || '' },
      { title: 'Evidence', text: Array.isArray(evidence) ? evidence.join('\n• ') : evidence || '' },
    ]);
    const issue = await jiraFetch(config, '/rest/api/3/issue', {
      method: 'POST', headers: { ...authHeaders(config), 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: {
        project: { key: config.projectKey }, issuetype: { name: config.issueType },
        summary: String(summary).slice(0, 255), description,
        labels: project ? ['etms', 'quality-assurance'] : ['ai-test-studio', 'automation-failure'],
      } }),
    });
    if (!issue?.id || !issue?.key) throw new AppError('Jira không trả về issue id/key hợp lệ. Kiểm tra Jira trước khi thử lại.', 502);
    const attachmentResult = await uploadAttachments(config, issue.key, attachments);
    const issueUrl = `${config.baseUrl}/browse/${encodeURIComponent(issue.key)}`;
    await saveLog({ status: 'Success', externalEntity: { type: 'Issue', id: issue.id, key: issue.key, url: issueUrl }, message: 'Đã tạo Jira Bug sau khi duyệt.' });
    return {
      id: issue.id, key: issue.key, url: issueUrl, integration: config.integration,
      provider: 'Jira', syncedAt: new Date(), attachments: attachmentResult.uploaded,
      warnings: attachmentResult.warnings,
    };
  } catch (error) {
    const message = String(error.message || 'Jira request failed').split(config.token).join('[REDACTED]').slice(0, 1000);
    await saveLog({ status: 'Failed', error: message });
    error.message = message;
    throw error;
  }
};

module.exports = { getJiraStatus, createJiraBug, _test: { adfDocument } };
