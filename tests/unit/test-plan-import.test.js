const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');

const { extractDocumentText } = require('../../services/documentExtractionService');
const { parseImportedTestPlanText, normalizeImportedTestPlan, importedPlanMissingFields } = require('../../controllers/executionController');

test('structured Test Plan text maps to editable draft fields without approval state', () => {
  const parsed = normalizeImportedTestPlan(parseImportedTestPlanText(`
Tên Test Plan: Kế hoạch đặt món
Phạm vi: Đặt món và theo dõi đơn
Mục tiêu
- Xác nhận luồng đặt món
Chiến lược: Risk-based E2E
Tiêu chí bắt đầu
- Requirement đã Baseline
Tiêu chí kết thúc
- Không còn lỗi Critical
Môi trường: Staging · Chrome
Rủi ro
Môi trường không ổn định | Chuẩn bị dữ liệu trước | QA
`, 'plan.docx'));
  assert.equal(parsed.name, 'Kế hoạch đặt món');
  assert.match(parsed.scope, /Đặt món/);
  assert.deepEqual(parsed.objectives, ['Xác nhận luồng đặt món']);
  assert.equal(parsed.risks[0].owner, 'QA');
  assert.deepEqual(importedPlanMissingFields(parsed), []);
  assert.equal(parsed.approvalStatus, undefined);
});

test('XLSX Test Plan content is extracted as labeled text', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Test Plan');
  sheet.addRows([['Tên Test Plan', 'FoodRush Smoke'], ['Phạm vi', 'Đặt món'], ['Môi trường', 'Staging']]);
  const buffer = await workbook.xlsx.writeBuffer();
  const extracted = await extractDocumentText({ buffer: Buffer.from(buffer), extension: '.xlsx' });
  assert.equal(extracted.extractionMethod, 'exceljs');
  assert.match(extracted.text, /FoodRush Smoke/);
  assert.match(extracted.text, /Phạm vi \| Đặt món/);
});

test('comprehensive Test Plan import keeps type, severity and priority matrices', () => {
  const parsed = normalizeImportedTestPlan({
    name: 'Cybersoft E-Learning',
    testTypeMatrix: [{ testType: 'Security / Access', purpose: 'Kiểm tra session và route được bảo vệ' }],
    defectManagement: {
      workflow: ['New', 'Open', 'Fixed', 'Retest', 'Closed'],
      severityDefinitions: [{ level: 'Critical', definition: 'Chặn luồng đăng nhập hoặc ghi danh' }],
      priorityDefinitions: [{ level: 'P1', definition: 'Phải sửa ngay' }],
    },
  });
  assert.equal(parsed.testTypeMatrix[0].testType, 'Security / Access');
  assert.equal(parsed.defectManagement.severityDefinitions[0].level, 'Critical');
  assert.equal(parsed.defectManagement.priorityDefinitions[0].level, 'P1');
});

test('flattened DOCX risk table keeps impact, mitigation and owner', () => {
  const parsed = normalizeImportedTestPlan(parseImportedTestPlanText(`
16 RỦI RO, GIẢ ĐỊNH VÀ PHỤ THUỘC
16.1 Rủi ro sản phẩm và kiểm thử
ID
Rủi ro
Tác động
Giảm thiểu
Phụ trách
R1
Voucher không được lưu vào đơn hàng
High
Đối chiếu subtotal và discount trong DB
QA Lead / Backend
16.2 Giả định
- Môi trường test có thể reset
16.3 Phụ thuộc
- Apache, PHP và MySQL
`, 'foodrush-test-plan.docx'));
  assert.deepEqual(parsed.riskMatrix[0], {
    risk: 'Voucher không được lưu vào đơn hàng',
    impact: 'High',
    mitigation: 'Đối chiếu subtotal và discount trong DB',
    owner: 'QA Lead / Backend',
  });
  assert.deepEqual(parsed.assumptions, ['Môi trường test có thể reset']);
  assert.deepEqual(parsed.dependencies, ['Apache, PHP và MySQL']);
});

test('flattened DOCX pass/fail table maps Test Case and Test Cycle conditions', () => {
  const parsed = normalizeImportedTestPlan(parseImportedTestPlanText(`
12 TIÊU CHÍ PASS VÀ FAIL
Đối tượng
Pass
Fail hoặc Blocked
Test Step
Actual khớp Expected
Actual khác Expected
Test Case
Tất cả step pass và cleanup hoàn tất
Ít nhất một step fail hoặc bị Blocked
Test Item
Tất cả P0 pass
Có P0 fail
Test Cycle
Đạt exit criteria và có sign-off
Không đạt exit criteria
12.1 Quy tắc phân loại kết quả
- Blocked không được tính là Pass
`, 'foodrush-test-plan.docx'));
  assert.equal(parsed.passFailCriteria.testCasePass, 'Tất cả step pass và cleanup hoàn tất');
  assert.equal(parsed.passFailCriteria.testCaseFail, 'Ít nhất một step fail hoặc bị Blocked');
  assert.equal(parsed.passFailCriteria.testCycleCompletion, 'Đạt exit criteria và có sign-off');
});
