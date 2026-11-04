const test = require('node:test');
const assert = require('node:assert/strict');
const mammoth = require('mammoth');
const { content, planHtml, exportTestPlan } = require('../../services/testPlanExportService');

const plan = { name: 'Nộp bài tập lớn – OOP', testItems: ['Tải tệp bài làm', 'Lưu thay đổi'], outOfScope: ['Chấm điểm'], testStrategy: 'Kiểm thử chức năng', testData: 'Sinh viên và tệp hợp lệ', entryCriteria: ['User Story đã duyệt'], exitCriteria: ['Đã thực thi'], objectives: ['Nộp bài thành công'], scope: 'Khóa học OOP', risks: [{ risk: 'Môi trường gián đoạn', mitigation: 'Chuẩn bị dự phòng', owner: 'QA' }], deliverables: ['Báo cáo kiểm thử'] };

test('DOCX export is a genuine Word document containing every plan section and Vietnamese text', async () => {
  const output = await exportTestPlan(plan, 'docx');
  assert.equal(output.buffer.subarray(0, 2).toString(), 'PK');
  assert.match(output.mime, /wordprocessingml/);
  const result = await mammoth.extractRawText({ buffer: output.buffer });
  for (const section of content(plan).sections) {
    assert.ok(result.value.includes(section.title.toUpperCase()), section.title);
    for (const row of section.rows) assert.ok(result.value.includes(row), row);
  }
  assert.ok(result.value.includes('Môi trường gián đoạn'));
  assert.ok(result.value.includes('Sinh viên và tệp hợp lệ'));
});

test('PDF template preserves two columns and escapes untrusted plan content', () => {
  const html = planHtml({ ...plan, name: '<img src="https://example.org/track">', scope: '<script>alert(1)</script>' });
  assert.ok(html.includes('grid-template-columns:1fr 1fr'));
  assert.ok(html.includes('print') || html.includes('@page'));
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img src='));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('legacy test data and multiline risks remain exportable', () => {
  const data = content({ description: 'Test data: Tài khoản sinh viên', risks: 'Rủi ro | Giảm thiểu | QA' });
  assert.deepEqual(data.sections[5].rows, ['Tài khoản sinh viên']);
  assert.deepEqual(data.risks, [['Rủi ro ', ' Giảm thiểu ', ' QA']]);
});
