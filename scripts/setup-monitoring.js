const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const dir = path.join(__dirname, '..', '.monitoring');
fs.mkdirSync(dir, { recursive: true });
const target = path.join(dir, 'metrics-token');
if (!fs.existsSync(target)) fs.writeFileSync(target, crypto.randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' });
console.log('Metrics token prepared; existing token was preserved.');
