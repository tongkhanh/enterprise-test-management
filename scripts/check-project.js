const fs = require('fs');
const path = require('path');

const roots = ['controllers', 'middleware', 'routes', 'services', 'utils'];
const files = roots.flatMap((root) => fs.readdirSync(path.join(__dirname, '..', root)).filter((name) => name.endsWith('.js')).map((name) => path.join(__dirname, '..', root, name)));
files.push(path.join(__dirname, '..', 'server.js'));

for (const file of files) require(file);

const publicFiles = ['index.html', 'workflow.css', 'workflow.js', 'studio/index.html', 'auth.html', 'agile-req.html', 'test-design.html', 'execution.html', 'bug-track.html', 'ai-core.html', 'reports.html', 'styles.css', 'app.js'];
const missing = publicFiles.filter((name) => !fs.existsSync(path.join(__dirname, '..', 'public', name)));
if (missing.length) throw new Error(`Thiếu giao diện public: ${missing.join(', ')}`);

console.log(`OK: đã nạp ${files.length} module backend và đủ ${publicFiles.length} tài nguyên giao diện.`);
