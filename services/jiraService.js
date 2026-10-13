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
      const detail = data?.errors ? Object.values(data.errors).join('; ') : data?.errorMessages?.join('; ') || String(data || `HTTP ${response.status}`);
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

const createJiraBug = async ({ summary, rootCause, confidence, severity, priority, environment, steps, evidence, targetUrl, attachments }) => {
  const config = assertConfiguration();
  const description = adfDocument([
    { title: 'Root cause có khả năng cao nhất', text: rootCause },
    { title: 'AI confidence', text: `${Math.round((confidence || 0) * 100)}%` },
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
      labels: ['ai-test-studio', 'automation-failure'],
    } }),
  });
  const attachmentResult = await uploadAttachments(config, issue.key, attachments);
  return {
    id: issue.id, key: issue.key, url: `${config.baseUrl}/browse/${encodeURIComponent(issue.key)}`,
    provider: 'Jira', syncedAt: new Date(), attachments: attachmentResult.uploaded,
    warnings: attachmentResult.warnings,
  };
};

module.exports = { getJiraStatus, createJiraBug, _test: { adfDocument } };
