const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const clean = (value) => String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/(password|token|secret|authorization)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]');
const isSensitiveField = (key) => /(password|token|secret|authorization|api[_-]?key|credential)/i.test(String(key || ''));
const safeValue = (value, key = '') => isSensitiveField(key) ? '[REDACTED]' : clean(value);
const xml = (value) => clean(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const label = (key) => ({ code: 'Mã', name: 'Tên', title: 'Tiêu đề', summary: 'Tóm tắt', actor: 'Actor', trigger: 'Kích hoạt', description: 'Mô tả', priority: 'Ưu tiên', status: 'Trạng thái', scope: 'Phạm vi', environment: 'Môi trường', executiveSummary: 'Tóm tắt điều hành', releaseRecommendation: 'Khuyến nghị phát hành', preconditions: 'Tiền điều kiện', mainFlow: 'Luồng chính', alternateFlows: 'Luồng thay thế', exceptionFlows: 'Luồng lỗi / phục hồi', postconditions: 'Hậu điều kiện', businessRules: 'Quy tắc nghiệp vụ', assumptions: 'Giả định', dependencies: 'Phụ thuộc', acceptanceCriteria: 'Acceptance Criteria', definitionOfDone: 'Definition of Done', testCaseId: 'Mã Test Case', objective: 'Mục tiêu kiểm thử', testDesignTechniques: 'Kỹ thuật thiết kế test', testSteps: 'Các bước kiểm thử', expectedResult: 'Kết quả mong đợi', testData: 'Dữ liệu test', objectives: 'Mục tiêu', testStrategy: 'Chiến lược kiểm thử', testItems: 'Hạng mục kiểm thử', outOfScope: 'Ngoài phạm vi', entryCriteria: 'Tiêu chí vào', exitCriteria: 'Tiêu chí ra', risks: 'Rủi ro', mitigation: 'Giảm thiểu', owner: 'Phụ trách', deliverables: 'Deliverables', coverage: 'Coverage', executionDetails: 'Chi tiết thực thi', defectSummary: 'Tổng hợp lỗi', highlights: 'Điểm nổi bật', recommendations: 'Khuyến nghị', metrics: 'Chỉ số', result: 'Kết quả thực thi', actualResult: 'Kết quả thực tế', routeCoverage: 'Route coverage', setup: 'Thiết lập', cleanup: 'Dọn dữ liệu', tags: 'Nhãn', generatedFrom: 'Nguồn sinh', estimatedTime: 'Ước tính (phút)', journeyType: 'Loại hành trình' }[key] || key);
function rows(value, prefix = '') {
  if (value === null || value === undefined || value === '') return [];
  if (Array.isArray(value)) return value.flatMap((item, i) => typeof item === 'object' ? rows(item, `${prefix}${prefix ? ' ' : ''}${i + 1}`) : [[label(prefix || 'Item'), clean(item)]]);
  if (typeof value === 'object') return Object.entries(value).flatMap(([key, item]) => {
    if (['_id', '__v', 'createdBy', 'approvedBy', 'systemProfile', 'project', 'testSuite', 'userStory', 'testPlan', 'testRun', 'aiSuggestion', 'aiMetadata'].includes(key)) return [];
    const next = prefix ? `${prefix} · ${label(key)}` : label(key);
    return typeof item === 'object' && item !== null ? rows(item, next) : [[next, safeValue(item, key)]];
  });
  return [[label(prefix), clean(value)]];
}
function resolvePdfFont() {
  const candidates = [process.env.PDF_FONT_PATH, path.join(process.cwd(), 'assets', 'fonts', 'NotoSans-Regular.ttf'), 'C:\\Windows\\Fonts\\arial.ttf'].filter(Boolean);
  return candidates.find((item) => fs.existsSync(item)) || null;
}
const arrayText = (value) => Array.isArray(value) ? value.map((item) => typeof item === 'object' ? (item.criteria || item.name || JSON.stringify(item)) : item).filter(Boolean).join('\n') : clean(value);
const cell = (value, style = 'Text') => `<Cell ss:StyleID="${style}"><Data ss:Type="String">${xml(value)}</Data></Cell>`;
const row = (cells, styles = []) => `<Row>${cells.map((value, index) => cell(value, styles[index] || 'Text')).join('')}</Row>`;
const worksheet = (name, widths, body, { freeze = false } = {}) => `<Worksheet ss:Name="${xml(name)}"><Table>${widths.map((width) => `<Column ss:Width="${width}"/>`).join('')}${body}</Table>${freeze ? '<WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane><Panes><Pane><Number>3</Number></Pane></Panes></WorksheetOptions>' : ''}</Worksheet>`;
const excelDocument = (sheets) => `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><Styles><Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Top" ss:WrapText="1"/><Font ss:FontName="Arial" ss:Size="10"/></Style><Style ss:ID="Title"><Font ss:FontName="Arial" ss:Bold="1" ss:Size="16" ss:Color="#172554"/><Alignment ss:Vertical="Center"/></Style><Style ss:ID="Section"><Font ss:FontName="Arial" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#1D4ED8" ss:Pattern="Solid"/><Alignment ss:Vertical="Center" ss:WrapText="1"/></Style><Style ss:ID="ExecutionHeader"><Font ss:FontName="Arial" ss:Bold="1" ss:Color="#111827"/><Interior ss:Color="#F4CCCC" ss:Pattern="Solid"/><Alignment ss:Vertical="Center" ss:Horizontal="Center" ss:WrapText="1"/></Style><Style ss:ID="Identifier"><Font ss:FontName="Arial" ss:Bold="1" ss:Color="#1E3A8A"/><Interior ss:Color="#D9E2F3" ss:Pattern="Solid"/><Alignment ss:Vertical="Top" ss:WrapText="1"/></Style><Style ss:ID="Label"><Font ss:FontName="Arial" ss:Bold="1" ss:Color="#1E3A8A"/><Interior ss:Color="#EFF6FF" ss:Pattern="Solid"/><Alignment ss:Vertical="Top" ss:WrapText="1"/></Style><Style ss:ID="Text"><Alignment ss:Vertical="Top" ss:WrapText="1"/></Style><Style ss:ID="Priority"><Font ss:FontName="Arial" ss:Bold="1" ss:Color="#334155"/><Interior ss:Color="#D9E2F3" ss:Pattern="Solid"/><Alignment ss:Vertical="Top" ss:WrapText="1"/></Style><Style ss:ID="Status"><Font ss:FontName="Arial" ss:Bold="1" ss:Color="#166534"/><Interior ss:Color="#D9EAD3" ss:Pattern="Solid"/><Alignment ss:Vertical="Top" ss:WrapText="1"/></Style></Styles>${sheets.join('')}</Workbook>`;

const cellText = (value) => clean(value).slice(0, 32000);
const caseId = (item, index) => cellText(item.testCaseId || `TC-${String(index + 1).padStart(3, '0')}`);
const caseJourney = (item) => cellText(item.e2e?.journeyType || item.journeyType || 'Functional');
const caseType = (item) => /negative|permission/i.test(caseJourney(item)) ? `Negative / ${caseJourney(item)}` : `Positive / ${caseJourney(item)}`;
const generatedDataText = (item) => {
  if (!item.generatedTestData || typeof item.generatedTestData !== 'object') return cellText(item.generatedTestData || '');
  return Object.entries(item.generatedTestData).map(([key, value]) => `${key}: ${isSensitiveField(key) ? '[REDACTED]' : (typeof value === 'object' ? JSON.stringify(value) : cellText(value))}`).join('\n');
};
function styleSheet(sheet, headers, widths) {
  sheet.columns = headers.map((header, index) => ({ header, key: `c${index}`, width: widths[index] || 22 }));
  const header = sheet.getRow(1);
  header.height = 28;
  header.eachCell((cell) => {
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: 'A1', to: { row: 1, column: headers.length } };
}
function appendSheetRows(sheet, values) {
  values.forEach((valuesForRow) => {
    const row = sheet.addRow(valuesForRow);
    row.eachCell((cell) => { cell.font = { name: 'Arial', size: 10 }; cell.alignment = { vertical: 'top', wrapText: true }; });
  });
}
async function writeXlsx(workbook) {
  workbook.creator = 'Enterprise Test Management System';
  workbook.created = new Date();
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
function testCaseWorkbook(title, artifact) {
  const e2e = artifact.e2e || {};
  const overview = [
    [`${title}: ${artifact.title || artifact.testCaseId || ''}`],
    ['Xuất lúc', new Date().toLocaleString('vi-VN')],
    ['Mã Test Case', artifact.testCaseId || ''], ['Tiêu đề', artifact.title || ''], ['Mô tả', artifact.description || ''], ['Mục tiêu kiểm thử', artifact.objective || ''], ['Ưu tiên', artifact.priority || ''], ['Trạng thái', artifact.status || ''], ['Ước tính (phút)', artifact.estimatedTime ?? ''], ['Loại hành trình', e2e.journeyType || ''], ['Environment / Target URL', artifact.targetUrl || ''], ['Route coverage', arrayText(e2e.routeCoverage)], ['Tiền điều kiện', artifact.preconditions || ''], ['Hậu điều kiện', artifact.postconditions || ''], ['Kỹ thuật thiết kế', arrayText(artifact.testDesignTechniques)], ['Setup', arrayText(e2e.setup)], ['Cleanup', arrayText(e2e.cleanup)], ['Tags', arrayText(artifact.tags)], ['Nguồn sinh', artifact.generatedFrom || ''], ['Test Suite', artifact.testSuite?.name || artifact.testSuite || ''], ['User Story', artifact.userStory?.title || artifact.userStory || ''],
  ];
  const overviewRows = `<Row ss:Height="28"><Cell ss:StyleID="Title" ss:MergeAcross="1"><Data ss:Type="String">${xml(overview[0][0])}</Data></Cell></Row>${overview.slice(1).map((item) => row(item, [item[0] === 'Ưu tiên' ? 'Priority' : 'Label', 'Text'])).join('')}`;
  const steps = artifact.testSteps || [];
  const stepRows = [row(['STT', 'Hành động', 'Kết quả mong đợi', 'Dữ liệu test', 'DSL action', 'Locator', 'Value'], Array(7).fill('Section')), ...steps.map((step, index) => row([step.stepNumber || index + 1, step.action || '', step.expectedResult || '', step.testData || '', step.automationAction || 'manual', step.locator ? JSON.stringify(step.locator) : '', step.value || '']))].join('');
  const testData = artifact.generatedTestData && typeof artifact.generatedTestData === 'object' ? Object.entries(artifact.generatedTestData) : [];
  const dataRows = [row(['Biến / trường dữ liệu', 'Giá trị hoặc mô tả'], ['Section', 'Section']), ...testData.map(([key, value]) => row([key, typeof value === 'object' ? JSON.stringify(value) : value], ['Label', 'Text']))].join('');
  const coverage = Array.isArray(artifact.storyCoverage) ? artifact.storyCoverage : [];
  const requirements = e2e.requirements || artifact.requirements || [];
  const traceRows = [row(['Loại truy vết', 'Nội dung'], ['Section', 'Section']), ...requirements.map((item) => row(['Requirement khách hàng', item?.requirementId ? `${item.requirementId} · ${item.title || ''}` : String(item || '')])), row(['Use Case', e2e.useCase?.name || e2e.useCase || '']), row(['User Story', artifact.userStory?.title || artifact.userStory || '']), ...coverage.map((item, index) => row([`Acceptance Criteria ${index + 1}`, item])), ...arrayText(artifact.tags).split('\n').filter(Boolean).map((item) => row(['Tag', item]))].join('');
  return excelDocument([
    worksheet('Test Case', [170, 680], overviewRows),
    worksheet('Steps', [45, 300, 300, 170, 110, 230, 170], stepRows, { freeze: true }),
    worksheet('Test Data', [220, 680], dataRows, { freeze: true }),
    worksheet('Traceability', [180, 680], traceRows, { freeze: true }),
  ]);
}
async function testCaseExecutionWorkbook(artifacts) {
  const cases = Array.isArray(artifacts) ? artifacts : [artifacts];
  const workbook = new ExcelJS.Workbook();

  const casesSheet = workbook.addWorksheet('Test Cases');
  styleSheet(casesSheet, ['Test Case ID', 'Test Suite', 'Use Case', 'User Story', 'Test Case Name', 'Objective', 'Preconditions', 'Postconditions', 'Type', 'Priority', 'Status', 'Estimated minutes', 'Target URL', 'Tags'], [18, 24, 26, 34, 42, 42, 40, 40, 18, 12, 16, 18, 34, 26]);
  appendSheetRows(casesSheet, cases.map((item, index) => [
    caseId(item, index), cellText(item.testSuite?.name || item.testSuite || ''), cellText(item.e2e?.useCase?.name || item.e2e?.useCase || ''), cellText(item.userStory?.title || item.userStory || ''), cellText(item.title), cellText(item.objective), cellText(item.preconditions), cellText(item.postconditions), caseType(item), cellText(item.priority || 'Medium'), cellText(item.status || 'Draft'), Number(item.estimatedTime) || 0, cellText(item.targetUrl), arrayText(item.tags),
  ]));

  const stepsSheet = workbook.addWorksheet('Steps');
  styleSheet(stepsSheet, ['Test Case ID', 'Step', 'Action', 'Expected Result', 'Test Data', 'DSL Action', 'Locator', 'Value'], [18, 9, 48, 48, 28, 18, 38, 28]);
  appendSheetRows(stepsSheet, cases.flatMap((item, caseIndex) => (item.testSteps || []).map((step, stepIndex) => [
    caseId(item, caseIndex), step.stepNumber || stepIndex + 1, cellText(step.action), cellText(step.expectedResult), cellText(step.testData), cellText(step.automationAction || 'manual'), step.locator ? cellText(JSON.stringify(step.locator)) : '', cellText(step.value),
  ])));

  const dataSheet = workbook.addWorksheet('Test Data');
  styleSheet(dataSheet, ['Test Case ID', 'Variable / field', 'Safe test value or description'], [18, 30, 90]);
  appendSheetRows(dataSheet, cases.flatMap((item, caseIndex) => {
    const generated = item.generatedTestData && typeof item.generatedTestData === 'object' ? Object.entries(item.generatedTestData) : [];
    return generated.length
      ? generated.map(([key, value]) => [caseId(item, caseIndex), cellText(key), isSensitiveField(key) ? '[REDACTED]' : (typeof value === 'object' ? cellText(JSON.stringify(value)) : cellText(value))])
      : [[caseId(item, caseIndex), 'Test data', generatedDataText(item) || '—']];
  }));

  const traceSheet = workbook.addWorksheet('Traceability');
  styleSheet(traceSheet, ['Test Case ID', 'Trace type', 'Reference'], [18, 28, 100]);
  appendSheetRows(traceSheet, cases.flatMap((item, caseIndex) => {
    const id = caseId(item, caseIndex);
    return [
      ...(item.e2e?.requirements || []).map((requirement) => [id, 'Customer requirement', cellText(requirement?.requirementId ? `${requirement.requirementId} · ${requirement.title || ''}` : requirement)]),
      [id, 'Use Case', cellText(item.e2e?.useCase?.name || item.e2e?.useCase || '')],
      [id, 'User Story', cellText(item.userStory?.title || item.userStory || '')],
      ...(item.storyCoverage || []).map((criterion, index) => [id, `Acceptance Criteria ${index + 1}`, cellText(criterion)]),
      ...(item.testDesignTechniques || []).map((technique) => [id, 'Test design technique', cellText(technique)]),
      ...(item.tags || []).map((tag) => [id, 'Tag', cellText(tag)]),
      [id, 'Setup', arrayText(item.e2e?.setup)],
      [id, 'Cleanup', arrayText(item.e2e?.cleanup)],
    ].filter((entry) => entry[2]);
  }));

  return writeXlsx(workbook);
}

async function genericWorkbook(title, artifact) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Export');
  styleSheet(sheet, ['Field', 'Value'], [34, 100]);
  appendSheetRows(sheet, [['Document', title], ['Exported at', new Date().toISOString()], ...rows(artifact)]);
  return writeXlsx(workbook);
}

async function genericDocx(title, artifact) {
  const children = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: clean(title), bold: true, font: 'Arial' })] }),
    new Paragraph({ children: [new TextRun({ text: `Xuất lúc: ${new Date().toLocaleString('vi-VN')}`, font: 'Arial', color: '64748B' })] }),
  ];
  rows(artifact).forEach(([field, value]) => {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: clean(field), bold: true, font: 'Arial' })] }));
    children.push(new Paragraph({ children: [new TextRun({ text: clean(value), font: 'Arial' })] }));
  });
  return Packer.toBuffer(new Document({ sections: [{ children }] }));
}
function pdf(title, rowsToExport) {
  const chunks = []; const document = new PDFDocument({ size: 'A4', margin: 44, info: { Title: title, Author: 'Enterprise Test Management System' } });
  const font = resolvePdfFont();
  document.on('data', (chunk) => chunks.push(chunk));
  if (font) document.font(font); else document.font('Helvetica');
  document.fontSize(18).fillColor('#172554').text(title);
  document.moveDown(0.25).fontSize(9).fillColor('#64748b').text(`Xuất lúc: ${new Date().toLocaleString('vi-VN')}`);
  document.moveDown(0.8);
  for (const [field, value] of rowsToExport) {
    if (document.y > 730) document.addPage();
    if (font) document.font(font); else document.font('Helvetica-Bold');
    document.fontSize(10).fillColor('#1e293b').text(String(field), { width: 150, continued: true });
    if (font) document.font(font); else document.font('Helvetica');
    document.fillColor('#334155').text(`  ${String(value)}`, { width: 350 });
    document.moveDown(0.25);
  }
  return new Promise((resolve, reject) => {
    document.once('end', () => resolve(Buffer.concat(chunks)));
    document.once('error', reject);
    document.end();
  });
}
async function exportArtifact(title, artifact, format) {
  const data = [['TÀI LIỆU', title], ['Xuất lúc', new Date().toISOString()], ...rows(artifact)];
  if (format === 'csv') return { buffer: Buffer.from(`\uFEFF${data.map((row) => row.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\r\n')}`, 'utf8'), mime: 'text/csv; charset=utf-8', ext: 'csv' };
  if (['xls', 'xlsx'].includes(format)) {
    const isTestCase = Array.isArray(artifact.testSteps) && (artifact.testCaseId || artifact.objective || artifact.e2e);
    const buffer = isTestCase ? await testCaseExecutionWorkbook([artifact]) : await genericWorkbook(title, artifact);
    return { buffer, mime: XLSX_MIME, ext: 'xlsx' };
  }
  if (['doc', 'docx'].includes(format)) return { buffer: await genericDocx(title, artifact), mime: DOCX_MIME, ext: 'docx' };
  return { buffer: await pdf(title, data), mime: 'application/pdf', ext: 'pdf' };
}
async function exportTestCases(cases) {
  if (!Array.isArray(cases) || !cases.length) throw new Error('Cần ít nhất một Test Case để xuất Excel.');
  return { buffer: await testCaseExecutionWorkbook(cases), mime: XLSX_MIME, ext: 'xlsx' };
}
module.exports = { exportArtifact, exportTestCases };
