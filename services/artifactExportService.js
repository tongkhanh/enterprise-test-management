const clean = (value) => String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/(password|token|secret|authorization)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]');
const xml = (value) => clean(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const label = (key) => ({ code: 'Mã', name: 'Tên', title: 'Tiêu đề', summary: 'Tóm tắt', actor: 'Actor', trigger: 'Kích hoạt', description: 'Mô tả', priority: 'Ưu tiên', status: 'Trạng thái', scope: 'Phạm vi', environment: 'Môi trường', executiveSummary: 'Tóm tắt điều hành', releaseRecommendation: 'Khuyến nghị phát hành', preconditions: 'Tiền điều kiện', mainFlow: 'Luồng chính', alternateFlows: 'Luồng thay thế', exceptionFlows: 'Luồng lỗi / phục hồi', postconditions: 'Hậu điều kiện', businessRules: 'Quy tắc nghiệp vụ', assumptions: 'Giả định', dependencies: 'Phụ thuộc', acceptanceCriteria: 'Acceptance Criteria', definitionOfDone: 'Definition of Done', testCaseId: 'Mã Test Case', objective: 'Mục tiêu kiểm thử', testDesignTechniques: 'Kỹ thuật thiết kế test', testSteps: 'Các bước kiểm thử', expectedResult: 'Kết quả mong đợi', testData: 'Dữ liệu test', objectives: 'Mục tiêu', testStrategy: 'Chiến lược kiểm thử', testItems: 'Hạng mục kiểm thử', outOfScope: 'Ngoài phạm vi', entryCriteria: 'Tiêu chí vào', exitCriteria: 'Tiêu chí ra', risks: 'Rủi ro', mitigation: 'Giảm thiểu', owner: 'Phụ trách', deliverables: 'Deliverables', coverage: 'Coverage', executionDetails: 'Chi tiết thực thi', defectSummary: 'Tổng hợp lỗi', highlights: 'Điểm nổi bật', recommendations: 'Khuyến nghị', metrics: 'Chỉ số', result: 'Kết quả thực thi', actualResult: 'Kết quả thực tế', routeCoverage: 'Route coverage', setup: 'Thiết lập', cleanup: 'Dọn dữ liệu', tags: 'Nhãn', generatedFrom: 'Nguồn sinh', estimatedTime: 'Ước tính (phút)', journeyType: 'Loại hành trình' }[key] || key);
function rows(value, prefix = '') {
  if (value === null || value === undefined || value === '') return [];
  if (Array.isArray(value)) return value.flatMap((item, i) => typeof item === 'object' ? rows(item, `${prefix}${prefix ? ' ' : ''}${i + 1}`) : [[label(prefix || 'Item'), clean(item)]]);
  if (typeof value === 'object') return Object.entries(value).flatMap(([key, item]) => {
    if (['_id', '__v', 'createdBy', 'approvedBy', 'systemProfile', 'project', 'testSuite', 'userStory', 'testPlan', 'testRun', 'aiSuggestion', 'aiMetadata'].includes(key)) return [];
    const next = prefix ? `${prefix} · ${label(key)}` : label(key);
    return typeof item === 'object' && item !== null ? rows(item, next) : [[next, clean(item)]];
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
const excelDocument = (sheets) => `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><Styles><Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Top" ss:WrapText="1"/><Font ss:FontName="Arial" ss:Size="10"/></Style><Style ss:ID="Title"><Font ss:FontName="Arial" ss:Bold="1" ss:Size="16" ss:Color="#172554"/><Alignment ss:Vertical="Center"/></Style><Style ss:ID="Section"><Font ss:FontName="Arial" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#1D4ED8" ss:Pattern="Solid"/><Alignment ss:Vertical="Center" ss:WrapText="1"/></Style><Style ss:ID="Label"><Font ss:FontName="Arial" ss:Bold="1" ss:Color="#1E3A8A"/><Interior ss:Color="#EFF6FF" ss:Pattern="Solid"/><Alignment ss:Vertical="Top" ss:WrapText="1"/></Style><Style ss:ID="Text"><Alignment ss:Vertical="Top" ss:WrapText="1"/></Style><Style ss:ID="Priority"><Font ss:FontName="Arial" ss:Bold="1" ss:Color="#991B1B"/><Interior ss:Color="#FEF2F2" ss:Pattern="Solid"/><Alignment ss:Vertical="Top" ss:WrapText="1"/></Style></Styles>${sheets.join('')}</Workbook>`;
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
  const traceRows = [row(['Loại truy vết', 'Nội dung'], ['Section', 'Section']), row(['Use Case', e2e.useCase?.name || e2e.useCase || '']), row(['User Story', artifact.userStory?.title || artifact.userStory || '']), ...coverage.map((item, index) => row([`Acceptance Criteria ${index + 1}`, item])), ...arrayText(artifact.tags).split('\n').filter(Boolean).map((item) => row(['Tag', item]))].join('');
  return excelDocument([
    worksheet('Test Case', [170, 680], overviewRows),
    worksheet('Steps', [45, 300, 300, 170, 110, 230, 170], stepRows, { freeze: true }),
    worksheet('Test Data', [220, 680], dataRows, { freeze: true }),
    worksheet('Traceability', [180, 680], traceRows, { freeze: true }),
  ]);
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
  if (format === 'csv') return { buffer: Buffer.from(data.map((row) => row.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\r\n'), 'utf8'), mime: 'text/csv; charset=utf-8', ext: 'csv' };
  if (format === 'xls') {
    const isTestCase = Array.isArray(artifact.testSteps) && (artifact.testCaseId || artifact.objective || artifact.e2e);
    const body = data.map((entry) => row(entry, ['Label', 'Text'])).join('');
    const workbook = isTestCase ? testCaseWorkbook(title, artifact) : excelDocument([worksheet('Export', [240, 720], body)]);
    return { buffer: Buffer.from(workbook, 'utf8'), mime: 'application/vnd.ms-excel', ext: 'xls' };
  }
  if (format === 'doc') { const body = data.map(([a, b]) => `<tr><th>${xml(a)}</th><td>${xml(b)}</td></tr>`).join(''); return { buffer: Buffer.from(`<html><meta charset="utf-8"><style>body{font-family:Arial}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:7px;text-align:left}th{width:30%;background:#f3f4f6}</style><body><h1>${xml(title)}</h1><table>${body}</table></body></html>`, 'utf8'), mime: 'application/msword', ext: 'doc' }; }
  return { buffer: await pdf(title, data), mime: 'application/pdf', ext: 'pdf' };
}
module.exports = { exportArtifact };
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
