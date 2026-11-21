// Run inside the broker container. Uses a disposable, frame-blocked fixture;
// no Atlas records, provider calls, or real website credentials are involved.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Docker = require('dockerode');
const { signRequest } = require('./protocol');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function smoke(base = 'http://127.0.0.1:3100') {
  const docker = new Docker(); const network = process.env.MANUAL_BROWSER_NETWORK || 'etms-manual-browsers';
  const people = [0, 1].map(() => ({ userId: crypto.randomBytes(12).toString('hex'), executionId: crypto.randomBytes(12).toString('hex') }));
  const fixtureCode = `require('http').createServer((req,res)=>{res.setHeader('X-Frame-Options','DENY');res.setHeader('Content-Security-Policy',"frame-ancestors 'none'");res.end(req.url.startsWith('/welcome')?'<h1>Logged in</h1>':'<html><body><h1>Blocked-frame fixture</h1><form action="/welcome"><input name="name" style="position:absolute;left:20px;top:100px"><button style="position:absolute;left:20px;top:160px">Login</button></form></body></html>')}).listen(8088,'0.0.0.0')`;
  const fixture = await docker.createContainer({ Image: 'etms-app:local', Cmd: ['node', '-e', fixtureCode], User: 'pwuser', Labels: { 'etms.manual-fixture': 'true' }, HostConfig: { NetworkMode: network, AutoRemove: true, CapDrop: ['ALL'], Memory: 128 * 1024 * 1024 } });
  async function request(identity, method, path, body, expected = 200) {
    const token = signRequest({ ...identity, method, path, body }, process.env.MANUAL_BROWSER_BROKER_SECRET);
    const response = await fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(70000) });
    assert.equal(response.status, expected, `${method} ${path} returned ${response.status}`); return response;
  }
  try {
    await fixture.start(); const ip = (await fixture.inspect()).NetworkSettings.Networks[network].IPAddress;
    const targetUrl = `http://${ip}:8088/`;
    await wait(1000);
    await request(people[0], 'POST', '/session', { targetUrl });
    await wait(1500);
    await request(people[0], 'POST', '/input', { events: [{ type: 'pointer', event: 'down', x: 45, y: 110 }, { type: 'pointer', event: 'up', x: 45, y: 110 }, { type: 'text', text: 'manual-tester' }, { type: 'pointer', event: 'down', x: 45, y: 170 }, { type: 'pointer', event: 'up', x: 45, y: 170 }] });
    let state;
    for (let attempt = 0; attempt < 20; attempt++) { state = await (await request(people[0], 'GET', '/session')).json(); if (state.url.includes('/welcome?name=manual-tester')) break; await wait(250); }
    assert.ok(state.url.includes('/welcome?name=manual-tester'), 'Remote input did not submit the form');
    const image = Buffer.from(await (await request(people[0], 'GET', '/screenshot')).arrayBuffer());
    assert.ok(image.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')));
    const stream = await request(people[0], 'GET', '/stream'); const reader = stream.body.getReader(); let events = '';
    while (!events.includes('event: frame')) { const result = await reader.read(); assert.equal(result.done, false); events += Buffer.from(result.value).toString(); }
    await reader.cancel();
    await request(people[0], 'POST', '/session', { targetUrl });
    assert.ok((await (await request(people[0], 'GET', '/session')).json()).url.includes('/welcome'), 'Reconnect lost the browser page');
    await request(people[1], 'GET', '/session', undefined, 404);
    await request(people[1], 'POST', '/session', { targetUrl });
    assert.ok(!(await (await request(people[1], 'GET', '/session')).json()).url.includes('/welcome'));
    console.log('PASS: headed Docker browser, frame-blocked target, mouse/typing, screenshot, streaming, reconnect, and owner isolation.');
  } finally {
    for (const person of people) await request(person, 'DELETE', '/session').catch(() => {});
    await fixture.remove({ force: true }).catch(() => {});
  }
}
if (require.main === module) (async () => {
  if (!process.argv.includes('--isolated')) return smoke();
  // The fixture is private. Allow it only in this temporary broker process;
  // leave the running service's production network policy unchanged.
  process.env.WEB_ANALYZER_ALLOW_PRIVATE = 'true';
  const broker = require('./broker').createBroker({ secret: process.env.MANUAL_BROWSER_BROKER_SECRET });
  const server = broker.app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
  try { await smoke(`http://127.0.0.1:${server.address().port}`); }
  finally { await broker.close(); await new Promise((resolve) => server.close(resolve)); }
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { smoke };
