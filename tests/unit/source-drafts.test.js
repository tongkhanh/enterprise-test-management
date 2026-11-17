const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fallbackUserStory, fallbackTestCases } = require('../../services/sourceDraftService');
const { evaluateTestCase } = require('../../services/documentQualityService');
const { exportArtifact } = require('../../services/artifactExportService');
const { PDFParse } = require('pdf-parse');

const criteria = [
  'Given trang đăng nhập, When nhập standard_user và secret_sauce rồi Login, Then hiển thị Products.',
  'Given trang đăng nhập, When nhập standard_user và wrong_password rồi Login, Then hiển thị lỗi đăng nhập.',
];

test('source drafts retain concrete criteria and never introduce permission or alternate scenarios', () => {
  const useCase = { name: 'Đăng nhập', actor: 'Tester', summary: 'Truy cập Products', requirements: [{ acceptanceCriteria: criteria }] };
  const story = fallbackUserStory(useCase);
  assert.deepEqual(story.acceptanceCriteria, criteria);
  assert.match(story.description, /Truy cập Products/);
  assert.doesNotMatch(story.description, /expected end-to-end business outcome/);
  const cases = fallbackTestCases({ useCase, story, targetUrl: '' });
  assert.equal(cases.length, 2);
  assert.match(cases[1].testSteps[0].action, /wrong_password/);
  assert.equal(cases[1].testSteps[0].expectedResult, 'hiển thị lỗi đăng nhập.');
  assert.deepEqual(cases[1].storyCoverage, [criteria[1]]);
  const quality = evaluateTestCase({ ...cases[0], generatedTestData: cases[0].testData, testSuite: 'suite' });
  assert.notEqual(quality.score, 100);
  assert.equal(quality.status, 'ReadyWithWarnings');
  assert.ok(quality.recommendedMissing.some((item) => item.key === 'sourceReview'));
});

test('PDF embeds readable Vietnamese through multiple pages and preserves complete long values', async () => {
  const note = 'Đăng nhập thành công. Hiển thị danh sách sản phẩm và giữ nguyên phiên đăng nhập.';
  const output = await exportArtifact('Báo cáo tổng kết kiểm thử', {
    title: 'Đăng nhập SauceDemo', actualResult: Array(100).fill(note).join('\n'), status: 'Approved', environment: 'https://www.saucedemo.com/',
  }, 'pdf');
  const parser = new PDFParse({ data: output.buffer });
  try {
    const result = await parser.getText();
    assert.ok(result.total > 1);
    assert.ok(result.text.includes('Báo cáo tổng kết kiểm thử'));
    assert.equal(result.text.replace(/\s+/g, ' ').split(note).length - 1, 100);
    assert.match(result.text, /Approved/);
    assert.match(result.text, /https:\/\/www.saucedemo.com\//);
  } finally { await parser.destroy(); }
});
