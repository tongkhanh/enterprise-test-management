const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const { ExecutionArtifact } = require('../models');

const TYPES = {
  '.png': ['Screenshot', 'image/png'], '.jpg': ['Screenshot', 'image/jpeg'], '.jpeg': ['Screenshot', 'image/jpeg'],
  '.webm': ['Video', 'video/webm'], '.mp4': ['Video', 'video/mp4'], '.zip': ['Trace', 'application/zip'],
  '.xml': ['Report', 'application/xml'], '.json': ['Report', 'application/json'], '.html': ['Report', 'text/html'],
  '.log': ['Log', 'text/plain'], '.txt': ['Log', 'text/plain'], '.har': ['Network', 'application/json'],
};

async function walk(directory, output = []) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true }).catch(() => [])) {
    if (['node_modules', '.git'].includes(entry.name)) continue;
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(filePath, output);
    else output.push(filePath);
    if (output.length >= 100) break;
  }
  return output;
}

async function normalizeEvidence({ directory, project, automationResult, source, environment }) {
  const files = await walk(directory);
  const rows = [];
  for (const filePath of files.slice(0, 100)) {
    if (/\.(?:js|cjs|mjs|ts|robot)$/.test(filePath) || /package(?:-lock)?\.json$/.test(filePath)) continue;
    const extension = path.extname(filePath).toLowerCase();
    const [artifactType, mimeType] = TYPES[extension] || ['Other', 'application/octet-stream'];
    const stat = await fs.stat(filePath);
    if (stat.size > 100 * 1024 * 1024) continue;
    const content = await fs.readFile(filePath);
    rows.push({
      project, automationResult, source, artifactType, name: path.relative(directory, filePath).replace(/\\/g, '/'),
      mimeType, uri: filePath, size: stat.size, checksum: crypto.createHash('sha256').update(content).digest('hex'),
      metadata: { engine: source, environment: environment ? String(environment) : null },
    });
  }
  const artifacts = rows.length ? await ExecutionArtifact.insertMany(rows) : [];
  const byType = {};
  for (const item of artifacts) {
    if (!byType[item.artifactType]) byType[item.artifactType] = [];
    byType[item.artifactType].push({ name: item.name, url: `/api/v1/execution-artifacts/${item._id}/download`, type: item.mimeType, checksum: item.checksum });
  }
  return { artifacts, normalized: { source, count: artifacts.length, byType } };
}

module.exports = { normalizeEvidence };
