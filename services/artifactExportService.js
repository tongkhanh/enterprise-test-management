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
  const candidates = [process.env.PDF_FONT_PATH, path.join(__dirname, '..', 'assets', 'fonts', 'NotoSans-Regular.ttf'), '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 'C:\\Windows\\Fonts\\arial.ttf'].filter(Boolean);
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
const caseType = (item) => {
  const journey = caseJourney(item).toLowerCase();
  if (journey.includes('permission') || journey.includes('security')) return 'Permission / Security';
  if (journey.includes('integration')) return 'Integration';
  if (journey.includes('boundary')) return 'Boundary';
  if (journey.includes('negative') || journey.includes('recovery')) return 'Negative';
  return 'Positive';
};
const generatedDataText = (item) => {
  if (!item.generatedTestData || typeof item.generatedTestData !== 'object') return cellText(item.generatedTestData || '');
  return Object.entries(item.generatedTestData).map(([key, value]) => `${key}: ${isSensitiveField(key) ? '[REDACTED]' : (typeof value === 'object' ? JSON.stringify(value) : cellText(value))}`).join('\n');
};
const functionalGroup = (item) => cellText(item.module || item.feature || item.primaryTestBasis?.title || item.e2e?.useCase?.scope || item.e2e?.useCase?.name || item.e2e?.requirements?.[0]?.scope?.name || item.e2e?.requirements?.[0]?.title || item.userStory?.labels?.[0] || item.userStory?.title || item.testSuite?.name || item.e2e?.systemProfile?.name || 'Test Cases');
const safeSheetBase = (value) => String(value || 'Test Cases').replace(/[\\/?*:[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Test Cases';
const uniqueSheetName = (value, used) => {
  const base = safeSheetBase(value);
  let name = base; let suffix = 2;
  while (used.has(name.toLocaleLowerCase())) { const tail = ` (${suffix++})`; name = `${base.slice(0, 31 - tail.length)}${tail}`; }
  used.add(name.toLocaleLowerCase()); return name;
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
  const grouped = new Map();
  cases.forEach((item, index) => { const group = functionalGroup(item); if (!grouped.has(group)) grouped.set(group, []); grouped.get(group).push({ item, index }); });
  const usedNames = new Set(['summary & coverage', 'steps', 'test data', 'traceability', 'lists']);
  const summarySheet = workbook.addWorksheet('Summary & Coverage');
  styleSheet(summarySheet, ['Functional group from Project', 'Test Cases', 'Primary test basis', 'Coverage status'], [44, 16, 80, 22]);
  appendSheetRows(summarySheet, [...grouped.entries()].map(([group, entries]) => [group, entries.length, [...new Set(entries.map(({ item }) => `${item.primaryTestBasis?.basisType || item.generatedFrom || 'Test Basis'} · ${item.primaryTestBasis?.code || item.primaryTestBasis?.title || 'Chưa ghi mã'}`))].join('\n'), entries.every(({ item }) => (item.coverageItems || item.storyCoverage || []).length) ? 'Có truy vết' : 'Cần rà soát']));
  const caseSheets = [];
  const headers = ['Test Case ID', 'Module / Feature', 'Requirement / User Story', 'Use Case ID', 'Test Case Name', 'Objective', 'Preconditions', 'Steps', 'Test Data', 'Expected Result', 'Type', 'Priority', 'Design Status', 'Environment / Target URL', 'Actual Result', 'Execution Status', 'Bug ID', 'Executed By', 'Execution Date'];
  const widths = [18, 24, 34, 18, 42, 38, 38, 48, 30, 48, 20, 14, 16, 38, 34, 18, 20, 20, 18];
  for (const [group, entries] of grouped.entries()) {
    const sheet = workbook.addWorksheet(uniqueSheetName(group, usedNames));
    caseSheets.push(sheet); styleSheet(sheet, headers, widths);
    appendSheetRows(sheet, entries.map(({ item, index }) => [
      caseId(item, index), functionalGroup(item),
      cellText([...(item.linkedRequirements || item.e2e?.requirements || []).map((requirement) => requirement?.requirementId ? `${requirement.requirementId} · ${requirement.title || ''}` : requirement), ...(item.linkedUserStories || (item.userStory ? [item.userStory] : [])).map((story) => story?.externalReference?.externalId ? `${story.externalReference.externalId} · ${story.title || ''}` : story?.title || story)].filter(Boolean).join('\n')),
      cellText((item.linkedUseCases || (item.e2e?.useCase ? [item.e2e.useCase] : [])).map((useCase) => useCase?.code ? `${useCase.code} · ${useCase.name || ''}` : useCase).join('\n')),
      cellText(item.title), cellText(item.objective), cellText(item.preconditions),
      (item.testSteps || []).map((step, stepIndex) => `${step.stepNumber || stepIndex + 1}. ${cellText(step.action)}`).join('\n'),
      generatedDataText(item) || (item.testSteps || []).map((step) => cellText(step.testData)).filter(Boolean).join('\n'),
      (item.testSteps || []).map((step, stepIndex) => `${step.stepNumber || stepIndex + 1}. ${cellText(step.expectedResult)}`).join('\n'),
      caseType(item), cellText(item.priority || 'Medium'), cellText(item.status || 'Draft'), cellText(item.targetUrl), '', 'Not Run', '', '', '',
    ]));
    sheet.getRow(1).eachCell((header) => { header.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF111827' } }; header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4CCCC' } }; });
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
      sheet.getCell(rowNumber, 11).dataValidation = { type: 'list', allowBlank: true, formulae: ['Lists!$A$2:$A$6'] };
      sheet.getCell(rowNumber, 12).dataValidation = { type: 'list', allowBlank: false, formulae: ['Lists!$B$2:$B$5'] };
      sheet.getCell(rowNumber, 16).dataValidation = { type: 'list', allowBlank: false, formulae: ['Lists!$C$2:$C$6'] };
      const priorityColors = { Critical: 'FFF4CCCC', High: 'FFFCE5CD', Medium: 'FFFFF2CC', Low: 'FFD9EAD3' };
      const priorityCell = sheet.getCell(rowNumber, 12); if (priorityColors[priorityCell.value]) priorityCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: priorityColors[priorityCell.value] } };
      sheet.getRow(rowNumber).height = 54;
    }
  }

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
      [id, 'Primary test basis', cellText(`${item.primaryTestBasis?.basisType || item.generatedFrom || ''} · ${item.primaryTestBasis?.code || ''} · ${item.primaryTestBasis?.title || ''}`)],
      ...(item.linkedRequirements || item.e2e?.requirements || []).map((requirement) => [id, 'Requirement', cellText(requirement?.requirementId ? `${requirement.requirementId} · ${requirement.title || ''}` : requirement)]),
      ...(item.linkedUseCases || (item.e2e?.useCase ? [item.e2e.useCase] : [])).map((useCase) => [id, 'Use Case', cellText(useCase?.code ? `${useCase.code} · ${useCase.name || ''}` : useCase)]),
      ...(item.linkedUserStories || (item.userStory ? [item.userStory] : [])).map((story) => [id, 'User Story', cellText(story?.externalReference?.externalId ? `${story.externalReference.externalId} · ${story.title || ''}` : story?.title || story)]),
      ...(item.coverageItems || item.storyCoverage || []).map((criterion, index) => [id, `Coverage item ${index + 1}`, cellText(criterion)]),
      ...(item.testDesignTechniques || []).map((technique) => [id, 'Test design technique', cellText(technique)]),
      ...(item.tags || []).map((tag) => [id, 'Tag', cellText(tag)]),
      [id, 'Setup', arrayText(item.e2e?.setup)],
      [id, 'Cleanup', arrayText(item.e2e?.cleanup)],
    ].filter((entry) => entry[2]);
  }));

  const listsSheet = workbook.addWorksheet('Lists');
  styleSheet(listsSheet, ['Type', 'Priority', 'Execution Status'], [28, 18, 22]);
  appendSheetRows(listsSheet, [
    ['Positive', 'Critical', 'Not Run'],
    ['Negative', 'High', 'Passed'],
    ['Boundary', 'Medium', 'Failed'],
    ['Permission / Security', 'Low', 'Blocked'],
    ['Integration', '', 'Skipped'],
  ]);
  listsSheet.state = 'veryHidden';
  caseSheets.forEach((sheet) => sheet.addConditionalFormatting({ ref: `P2:P${Math.max(2, sheet.rowCount)}`, rules: [
    { type: 'containsText', operator: 'containsText', text: 'Passed', style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFC6EFCE' } } } },
    { type: 'containsText', operator: 'containsText', text: 'Failed', style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFC7CE' } } } },
    { type: 'containsText', operator: 'containsText', text: 'Blocked', style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFCE5CD' } } } },
  ] }));

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
  const font = resolvePdfFont();
  if (!font) throw new Error('Không tìm thấy font Unicode cho PDF. Cài fonts-dejavu-core hoặc cấu hình PDF_FONT_PATH.');
  const chunks = []; const document = new PDFDocument({ size: 'A4', margin: 44, info: { Title: title, Author: 'Enterprise Test Management System' } });
  document.on('data', (chunk) => chunks.push(chunk));
  document.font(font);
  document.fontSize(18).fillColor('#172554').text(title);
  document.moveDown(0.25).fontSize(9).fillColor('#64748b').text(`Xuất lúc: ${new Date().toLocaleString('vi-VN')}`);
  document.moveDown(0.8);
  for (const [field, value] of rowsToExport) {
    const width = document.page.width - document.page.margins.left - document.page.margins.right;
    document.fontSize(10);
    const labelHeight = document.heightOfString(String(field), { width });
    if (document.y + labelHeight + 28 > document.page.height - document.page.margins.bottom) document.addPage();
    document.fillColor('#172554').text(String(field), document.page.margins.left, document.y, { width });
    document.moveDown(0.15).fillColor('#334155').text(String(value), document.page.margins.left, document.y, { width });
    document.moveDown(0.6);
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
