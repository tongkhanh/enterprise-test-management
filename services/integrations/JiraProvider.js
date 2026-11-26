const IntegrationProvider = require('./IntegrationProvider');
const { AppError } = require('../../utils/http');
const statusName = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

class JiraProvider extends IntegrationProvider {
  authorization() {
    const email = this.connection.settings?.accountEmail;
    return email
      ? `Basic ${Buffer.from(`${email}:${this.credential}`).toString('base64')}`
      : `Bearer ${this.credential}`;
  }

  async testConnection() {
    const user = await this.request('/rest/api/3/myself', { headers: { Authorization: this.authorization() } });
    return { identity: user?.displayName || user?.emailAddress || user?.accountId, accountId: user?.accountId || '', provider: 'Jira' };
  }

  headers() { return { Authorization: this.authorization(), 'Content-Type': 'application/json' }; }
  async updateIssue(key, fields) { return this.request(`/rest/api/3/issue/${encodeURIComponent(key)}`, { method: 'PUT', headers: this.headers(), body: JSON.stringify({ fields }) }); }
  async addComment(key, body) { return this.request(`/rest/api/3/issue/${encodeURIComponent(key)}/comment`, { method: 'POST', headers: this.headers(), body: JSON.stringify({ body: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: String(body).slice(0, 30000) }] }] } }) }); }
  async transitionIssue(key, targetName) {
    const endpoint = `/rest/api/3/issue/${encodeURIComponent(key)}`;
    const issue = await this.request(`${endpoint}?fields=status`, { headers: this.headers() });
    const current = issue?.fields?.status?.name;
    if (statusName(current) === statusName(targetName)) return { unchanged: true, status: current };
    const data = await this.request(`${endpoint}/transitions`, { headers: this.headers() });
    // Transition names can be actions such as "Start work"; match their
    // destination status rather than assuming the action has the same name.
    const match = (data.transitions || []).find((transition) => statusName(transition.to?.name || transition.name) === statusName(targetName));
    if (!match) throw new AppError(`Không có transition Jira từ "${current || 'Unknown'}" đến "${targetName}". Kiểm tra Ánh xạ trạng thái trong Settings → Integrations.`, 409);
    await this.request(`${endpoint}/transitions`, { method: 'POST', headers: this.headers(), body: JSON.stringify({ transition: { id: match.id } }) });
    return { transitioned: true, status: match.to?.name || targetName };
  }
}

module.exports = JiraProvider;
