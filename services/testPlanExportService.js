const { chromium } = require('playwright');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, HeadingLevel, AlignmentType,
} = require('docx');

const lines = (value) => (Array.isArray(value) ? value : String(value || '').split(/\r?\n/)).map((x) => String(x).trim()).filter(Boolean);
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function content(plan) {
  const risks = Array.isArray(plan.risks) ? plan.risks : lines(plan.risks).map((line) => { const [risk, mitigation, owner] = line.split('|'); return { risk, mitigation, owner }; });
  return {
    name: plan.name || 'Chưa đặt tên Test Plan', description: plan.description || 'Bản kế hoạch kiểm thử đang được hoàn thiện.',
    metadata: [['Mã kế hoạch', plan.planId || 'Sẽ tạo khi lưu'], ['Môi trường', plan.environment || 'Chưa xác định'], ['Trạng thái phê duyệt', plan.approvalStatus || 'Draft']],
    sections: [
      ['1. Mục tiêu kiểm thử', plan.objectives], ['2. Phạm vi kiểm thử', plan.scope],
      ['3. Hạng mục kiểm thử', plan.testItems], ['4. Ngoài phạm vi', plan.outOfScope],
      ['5. Chiến lược / phương pháp', plan.testStrategy], ['6. Dữ liệu kiểm thử', plan.testData || (String(plan.description || '').startsWith('Test data: ') ? plan.description.slice(11) : '')],
      ['7. Tiêu chí bắt đầu', plan.entryCriteria], ['8. Tiêu chí kết thúc', plan.exitCriteria],
      ['10. Deliverables', plan.deliverables],
    ].map(([title, value]) => ({ title, rows: lines(value) })),
    risks: risks.filter((x) => x && (x.risk || x.mitigation || x.owner)).map((x) => [x.risk || '', x.mitigation || 'QA xác nhận khi review.', x.owner || 'Chưa phân công']),
  };
}
function planHtml(plan) {
  const data = content(plan);
  const section = (s) => s.rows.length ? `<section><h2>${escape(s.title)}</h2><ul>${s.rows.map((x) => `<li>${escape(x)}</li>`).join('')}</ul></section>` : '';
  return `<!doctype html><html lang="vi"><meta charset="utf-8"><style>
    @page{size:A4;margin:12mm}*{box-sizing:border-box}body{font:10px/1.55 Arial,sans-serif;color:#1e293b;margin:0}header{background:#f8fafc;padding:16px;border:1px solid #cbd5e1;border-bottom:3px solid #7c3aed}h1{font-size:17px;color:#0f172a;margin:4px 0}p{margin:4px 0;color:#64748b}.label{color:#7c3aed;font-weight:bold;letter-spacing:2px}.meta{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:14px}.meta span{display:block;color:#64748b}.body{padding:12px;border:1px solid #cbd5e1;border-top:0}section{border:1px solid #cbd5e1;border-radius:5px;padding:9px;margin-bottom:10px;break-inside:avoid}h2{font-size:9px;text-transform:uppercase;color:#475569;margin:0 0 6px}ul{margin:0;padding-left:17px}li{margin:3px 0;overflow-wrap:anywhere}.pair{display:grid;grid-template-columns:1fr 1fr;gap:10px}.pair section{min-width:0}table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{text-align:left;vertical-align:top;padding:7px;border:1px solid #cbd5e1;overflow-wrap:anywhere}th{background:#f8fafc}tr{break-inside:avoid}thead{display:table-header-group}
    </style><header><div class="label">TEST PLAN</div><h1>${escape(data.name)}</h1><p>${escape(data.description)}</p><div class="meta">${data.metadata.map(([a,b]) => `<div><span>${escape(a)}</span><strong>${escape(b)}</strong></div>`).join('')}</div></header><div class="body">${section(data.sections[0])}${section(data.sections[1])}${[2,4,6].map((i) => `<div class="pair">${section(data.sections[i])}${section(data.sections[i+1])}</div>`).join('')}${data.risks.length ? `<section><h2>9. Rủi ro và phương án xử lý</h2><table><thead><tr>${['Rủi ro','Giảm thiểu','Phụ trách'].map((x) => `<th>${x}</th>`).join('')}</tr></thead><tbody>${data.risks.map((r) => `<tr>${r.map((x) => `<td>${escape(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></section>` : ''}${section(data.sections[8])}</div></html>`;
}
async function word(plan) {
  const data = content(plan);
  // Keep the Word document deliberately conventional.  Some Word versions are
  // much less forgiving than ZIP/XML validators when a document uses a deeply
  // nested table layout (especially when a draft plan has empty values).
  const text = (value) => String(value ?? '');
  const run = (value, options = {}) => new TextRun({ text: text(value), font: 'Arial', ...options });
  const paragraph = (value, options = {}) => new Paragraph({
    spacing: { after: options.after ?? 100 },
    alignment: options.alignment,
    bullet: options.bullet ? { level: 0 } : undefined,
    heading: options.heading,
    children: [run(value, { bold: options.bold, color: options.color, size: options.size ?? 20 })],
  });
  const border = { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' };
  const cell = (value, options = {}) => new TableCell({
    width: options.width ? { size: options.width, type: WidthType.DXA } : undefined,
    margins: { top: 120, bottom: 120, left: 140, right: 140 },
    borders: { top: border, bottom: border, left: border, right: border },
    children: Array.isArray(value) ? value : [paragraph(value, { bold: options.bold, color: options.color, size: options.size, after: 0 })],
  });
  const table = (rows, widths) => new Table({
    width: { size: 10400, type: WidthType.DXA },
    columnWidths: widths,
    rows: rows.map((row) => new TableRow({ children: row })),
  });

  const children = [
    paragraph('TEST PLAN', { bold: true, color: '7C3AED', size: 20, alignment: AlignmentType.CENTER, after: 60 }),
    paragraph(data.name, { bold: true, color: '0F172A', size: 32, alignment: AlignmentType.CENTER, after: 80 }),
    paragraph(data.description, { color: '475569', size: 20, alignment: AlignmentType.CENTER, after: 220 }),
    table([
      data.metadata.map(([label]) => cell(label, { bold: true, color: '475569', size: 18, width: 3466 })),
      data.metadata.map(([, value]) => cell(value, { width: 3466 })),
    ], [3466, 3467, 3467]),
    paragraph('', { after: 100 }),
  ];

  for (const section of data.sections) {
    if (!section.rows.length) continue;
    children.push(paragraph(section.title.toUpperCase(), { heading: HeadingLevel.HEADING_1, bold: true, color: '334155', size: 24, after: 100 }));
    section.rows.forEach((value) => children.push(paragraph(value, { bullet: true, after: 70 })));
    children.push(paragraph('', { after: 30 }));
  }

  if (data.risks.length) {
    children.push(paragraph('9. RỦI RO VÀ PHƯƠNG ÁN XỬ LÝ', { heading: HeadingLevel.HEADING_1, bold: true, color: '334155', size: 24, after: 100 }));
    children.push(table([
      ['Rủi ro', 'Giảm thiểu', 'Phụ trách'].map((value, index) => cell(value, { bold: true, color: '475569', size: 18, width: [4000, 4000, 2400][index] })),
      ...data.risks.map((risk) => risk.map((value, index) => cell(value, { width: [4000, 4000, 2400][index] }))),
    ], [4000, 4000, 2400]));
  }

  return Packer.toBuffer(new Document({
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 650, bottom: 650, left: 750, right: 750 } } },
      children,
    }],
  }));
}
async function exportTestPlan(plan, format) {
  if (format === 'docx') return { buffer: await word(plan), ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
  if (format !== 'pdf') throw new Error('Định dạng không được hỗ trợ.');
  // Windows installations can use the installed Edge when Playwright's bundled browser is absent.
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) }).catch((error) => {
    if (process.platform === 'win32' && !process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH && /Executable doesn't exist/.test(error.message)) return chromium.launch({ headless: true, channel: 'msedge' });
    throw error;
  });
  try {
    const page = await browser.newPage();
    await page.setContent(planHtml(plan), { waitUntil: 'load' });
    return { buffer: await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true }), ext: 'pdf', mime: 'application/pdf' };
  } finally { await browser.close(); }
}
module.exports = { exportTestPlan, planHtml, content };
