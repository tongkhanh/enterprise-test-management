const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mask, parseDataset, normalizeMatrix, flakyStats } = require('../../services/automationPolicyService');
const { substitute } = require('../../services/automationResourcesService');

test('CSV supports quotes, commas, Unicode and multiple rows', () => {
  assert.deepEqual(parseDataset('email,note\na@example.com,"Xin chào, QA"\nb@example.com,"say ""hi"""', 'csv'), [
    { email: 'a@example.com', note: 'Xin chào, QA' }, { email: 'b@example.com', note: 'say "hi"' },
  ]);
});
test('invalid CSV headers, unmatched quotes and invalid JSON rejected', () => {
  for (const csv of ['a,a\n1,2', '__proto__,x\n1,2', 'a\n"missing']) assert.throws(() => parseDataset(csv, 'csv'));
  for (const json of ['{}', '[]', '[null]', 'bad']) assert.throws(() => parseDataset(json, 'json'));
});
test('sensitive fields recursively masked', () => {
  assert.deepEqual(mask({ rows: [{ password: 'do-not-return', apiKey: 'secret', note: 'Bearer abc' }] }),
    { rows: [{ password: '[REDACTED]', apiKey: '[REDACTED]', note: 'Bearer [REDACTED]' }] });
});
test('default Linux matrix and unsupported OS/version validation', () => {
  assert.equal(normalizeMatrix()[0].browser, 'chromium');
  assert.throws(() => normalizeMatrix([{ browser: 'chromium', os: 'windows' }]));
  assert.throws(() => normalizeMatrix([{ browser: 'chrome', browserVersion: '120' }]));
  assert.throws(() => normalizeMatrix(Array(13).fill({ browser: 'chromium' })));
});
test('flaky score counts pass/fail alternation but not infrastructure errors', () => {
  assert.deepEqual(flakyStats(['Passed', 'Error', 'Failed', 'Passed']), { samples: 3, transitions: 2, score: 100, passed: 2, failed: 1 });
  assert.equal(flakyStats(['Passed', 'Passed']).score, 0);
});
test('dataset interpolation is JSON escaped and missing values fail closed', () => {
  const value = '\"; throw new Error("injection"); //\n';
  assert.equal(substitute('fill("$password")', { password: value }, 'Playwright'), `fill(${JSON.stringify(value)})`);
  assert.throws(() => substitute('fill("$absent")', {}, 'Playwright'));
});
