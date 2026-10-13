const { AppError } = require('../../utils/http');

class IntegrationProvider {
  constructor({ connection, credential }) {
    this.connection = connection;
    this.credential = credential;
  }

  get baseUrl() {
    return String(this.connection.baseUrl || '').replace(/\/+$/, '');
  }

  assertConfigured() {
    if (!this.baseUrl) throw new AppError(`${this.connection.provider} chưa có Base URL.`, 422);
    if (!this.credential) throw new AppError(`${this.connection.provider} chưa có access token.`, 422);
  }

  async request(endpoint, options = {}) {
    this.assertConfigured();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(process.env.INTEGRATION_TIMEOUT_MS || 12000));
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers: { Accept: 'application/json', ...options.headers },
        signal: controller.signal,
      });
      const text = await response.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = null; }
      if (!response.ok) {
        const providerMessage = data?.message || data?.errorMessages?.join('; ') || data?.errors?.[0]?.message || `HTTP ${response.status}`;
        throw new AppError(`${this.connection.provider} từ chối kết nối: ${String(providerMessage).slice(0, 500)}`, 502);
      }
      return data;
    } catch (error) {
      if (error.name === 'AbortError') throw new AppError(`${this.connection.provider} không phản hồi trong thời gian cho phép.`, 504);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async testConnection() {
    throw new Error('Provider phải triển khai testConnection().');
  }

  mapExternalIssue(issue) {
    return {
      provider: this.connection.provider,
      id: String(issue?.id || ''),
      key: String(issue?.key || issue?.number || issue?.identifier || ''),
      url: String(issue?.url || issue?.html_url || issue?.webUrl || ''),
      title: String(issue?.summary || issue?.title || ''),
      status: String(issue?.status?.name || issue?.state || ''),
    };
  }
}

module.exports = IntegrationProvider;
