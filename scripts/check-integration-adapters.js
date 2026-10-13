const assert = require('node:assert/strict');
const http = require('node:http');
const { createIntegrationProvider } = require('../services/integrations');

const run = async () => {
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/user') return res.end(JSON.stringify({ id: 1, login: 'github-fixture', name: 'GitHub Fixture' }));
    if (req.url === '/rest/api/3/myself') return res.end(JSON.stringify({ accountId: 'jira-1', displayName: 'Jira Fixture' }));
    if (req.url === '/graphql') return res.end(JSON.stringify({ data: { viewer: { id: 'linear-1', name: 'Linear Fixture', email: 'linear@example.test' } } }));
    res.statusCode = 404; return res.end(JSON.stringify({ message: 'Not found' }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const fixtures = [
      { provider: 'GitHub', settings: {}, identity: 'GitHub Fixture' },
      { provider: 'Jira', settings: { accountEmail: 'jira@example.test' }, identity: 'Jira Fixture' },
      { provider: 'Linear', settings: {}, identity: 'Linear Fixture' },
    ];
    for (const fixture of fixtures) {
      const adapter = createIntegrationProvider({ connection: { provider: fixture.provider, baseUrl, settings: fixture.settings }, credential: 'fixture-token' });
      const result = await adapter.testConnection();
      assert.equal(result.provider, fixture.provider);
      assert.equal(result.identity, fixture.identity);
    }
    console.log('OK: Jira, GitHub và Linear adapters test connection đúng contract.');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

run().catch((error) => { console.error(error); process.exitCode = 1; });
