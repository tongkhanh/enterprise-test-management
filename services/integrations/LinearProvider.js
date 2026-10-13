const IntegrationProvider = require('./IntegrationProvider');

class LinearProvider extends IntegrationProvider {
  async testConnection() {
    const data = await this.request('/graphql', {
      method: 'POST',
      headers: { Authorization: this.credential, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'query EtmsConnectionTest { viewer { id name email } }' }),
    });
    if (data?.errors?.length) throw new Error(`Linear trả lỗi: ${data.errors[0].message}`);
    const viewer = data?.data?.viewer;
    return { identity: viewer?.name || viewer?.email, accountId: viewer?.id || '', provider: 'Linear' };
  }
}

module.exports = LinearProvider;
