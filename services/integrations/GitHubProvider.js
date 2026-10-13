const IntegrationProvider = require('./IntegrationProvider');

class GitHubProvider extends IntegrationProvider {
  async testConnection() {
    const user = await this.request('/user', {
      headers: { Authorization: `Bearer ${this.credential}`, 'X-GitHub-Api-Version': '2022-11-28' },
    });
    return { identity: user?.name || user?.login, accountId: String(user?.id || ''), provider: 'GitHub' };
  }
}

module.exports = GitHubProvider;
