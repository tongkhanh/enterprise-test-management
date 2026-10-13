const assert = require('node:assert/strict');
const { app } = require('../server');

const run = async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(`${base}/studio/ai-generator`); const html = await response.text();
    assert.equal(response.status, 200); assert.match(html, /AI Core · ETMS/); assert.match(html, /id="root"/);
    const paths = [...html.matchAll(/(?:src|href)="(\/studio\/assets\/[^"]+)"/g)].map((match) => match[1]);
    assert.ok(paths.length >= 2, 'Production build phải có JS và CSS assets.');
    for (const asset of paths) { const result = await fetch(`${base}${asset}`); assert.equal(result.status, 200, `Không tải được ${asset}`); }
    console.log('OK: React Studio deep route và production assets được Express phục vụ đúng.');
  } finally { await new Promise((resolve) => server.close(resolve)); }
};
run().catch((error) => { console.error(error); process.exitCode = 1; });
