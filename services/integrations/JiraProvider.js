const IntegrationProvider = require('./IntegrationProvider');

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
  async transitionIssue(key, targetName) { const data = await this.request(`/rest/api/3/issue/${encodeURIComponent(key)}/transitions`, { headers: this.headers() }); const match = (data.transitions || []).find((x) => String(x.name).toLowerCase() === String(targetName).toLowerCase()); if (!match) return { skipped: true, reason: `Không tìm thấy transition ${targetName}` }; return this.request(`/rest/api/3/issue/${encodeURIComponent(key)}/transitions`, { method: 'POST', headers: this.headers(), body: JSON.stringify({ transition: { id: match.id } }) }); }
}

module.exports = JiraProvider;
