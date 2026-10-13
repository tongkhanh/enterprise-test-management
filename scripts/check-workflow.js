const assert = require('node:assert/strict');
const { app } = require('../server');

const run = async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  try {
    const page = await fetch(base);
    const html = await page.text();
    assert.equal(page.status, 200);
    for (const marker of ['AI Test Studio', 'stage-context', 'stage-discover', 'stage-design', 'stage-review', 'stage-execute', 'stage-diagnose', 'stage-triage']) {
      assert.ok(html.includes(marker), `Thiếu marker giao diện: ${marker}`);
    }
    const [script, style] = await Promise.all([fetch(`${base}/workflow.js`), fetch(`${base}/workflow.css`)]);
    assert.equal(script.status, 200); assert.equal(style.status, 200);
    const protectedRoutes = [
      '/api/v1/projects/demo/members',
      '/api/v1/automation/jobs/demo',
      '/api/v1/automation-results/demo/artifacts/screenshot.jpg',
      '/api/v1/test-plans/from-approved',
      '/api/v1/test-runs/demo/execute',
      '/api/v1/integrations/jira/status',
    ];
    for (const route of protectedRoutes) {
      const response = await fetch(`${base}${route}`);
      assert.equal(response.status, 401, `${route} phải được JWT bảo vệ`);
    }
    console.log('OK: workflow có đủ 7 bước, asset tải được và endpoint automation được bảo vệ.');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

run().catch((error) => { console.error(error); process.exitCode = 1; });
