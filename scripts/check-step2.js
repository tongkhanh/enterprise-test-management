require('dotenv').config();
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { Document, Packer, Paragraph, TextRun } = require('docx');
const {
  User, Workspace, Project, ProjectMembership, UserStory, UserStoryDocument,
  Sprint, ProjectLabel, ProjectActivity,
} = require('../models');
const auth = require('../controllers/authController');
const documents = require('../controllers/documentController');
const cycles = require('../controllers/cycleController');
const { extractDocumentText, removeStoredDocument } = require('../services/documentExtractionService');
const { getDocumentContext } = require('../services/documentContextService');

const invoke = async (handler, req) => {
  let payload; let statusCode = 200;
  const res = { status(value) { statusCode = value; return this; }, json(value) { payload = value; return this; } };
  await handler(req, res);
  return { statusCode, payload };
};

const createPdf = (text) => {
  const escaped = text.replace(/([\\()])/g, '\\$1');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${escaped.length + 31} >>\nstream\nBT /F1 14 Tf 72 720 Td (${escaped}) Tj ET\nendstream`,
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(body, 'latin1')); body += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(body, 'latin1');
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { body += `${String(offset).padStart(10, '0')} 00000 n \n`; });
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body, 'latin1');
};

const run = async () => {
  if (!process.env.MONGODB_URI) throw new Error('Thiếu MONGODB_URI.');
  const docxBuffer = await Packer.toBuffer(new Document({ sections: [{ children: [
    new Paragraph({ children: [new TextRun('User Story: As a customer, I want to sign in securely.')] }),
    new Paragraph({ children: [new TextRun('Acceptance Criteria: Valid credentials open the dashboard.')] }),
  ] }] }));
  const pdfBuffer = createPdf('Acceptance Criteria PDF: Invalid password shows an error message.');
  const [docxText, pdfText] = await Promise.all([
    extractDocumentText({ buffer: docxBuffer, extension: '.docx' }),
    extractDocumentText({ buffer: pdfBuffer, extension: '.pdf' }),
  ]);
  assert.match(docxText.text, /sign in securely/i);
  assert.match(pdfText.text, /Invalid password/i);

  await mongoose.connect(process.env.MONGODB_URI);
  await auth.ensureRoles();
  const fixture = new mongoose.Types.ObjectId().toHexString().slice(-8);
  let admin; let workspace; let project; let story;
  try {
    const adminRole = await mongoose.model('Role').findOne({ name: 'Admin', workspace: null });
    admin = await User.create({ fullName: 'Step 2 Admin', email: `step2-${fixture}@example.test`, passwordHash: await bcrypt.hash('Fixture@2026', 4), role: adminRole._id });
    await admin.populate('role');
    workspace = await Workspace.create({ name: `Step 2 ${fixture}`, slug: `step-2-${fixture}`, owner: admin._id, maxMembers: 10 });
    admin.workspace = workspace._id; await admin.save({ validateBeforeSave: false });
    project = await Project.create({ name: `Documents ${fixture}`, key: `D${fixture.slice(-6)}`.toUpperCase(), workspace: workspace._id, lead: admin._id, members: [admin._id] });
    await ProjectMembership.create({ project: project._id, user: admin._id, role: 'Admin' });
    story = await UserStory.create({ title: 'Secure login', description: 'Login flow', project: project._id, createdBy: admin._id, acceptanceCriteria: [{ criteria: 'Open dashboard after successful login' }] });

    const upload = await invoke(documents.uploadDocument, {
      params: { id: String(story._id) }, user: admin,
      file: { originalname: 'secure-login.docx', size: docxBuffer.length, buffer: docxBuffer },
    });
    assert.equal(upload.statusCode, 201);
    assert.equal(upload.payload.data.status, 'Ready');
    assert.equal(upload.payload.data.extractionMethod, 'mammoth');

    const context = await getDocumentContext({ storyId: story._id, documentIds: [upload.payload.data._id] });
    assert.equal(context.documents.length, 1);
    assert.match(context.contextText, /dashboard/i);

    const cycleResponse = await invoke(cycles.createCycle, { body: { project: String(project._id), name: 'Cycle 1', goal: 'Authentication regression', startDate: '2026-08-10', endDate: '2026-08-24', capacity: 20 }, user: admin });
    assert.equal(cycleResponse.statusCode, 201);
    const labelResponse = await invoke(cycles.createLabel, { body: { project: String(project._id), name: 'Regression', color: '#6D5DFB' }, user: admin });
    assert.equal(labelResponse.statusCode, 201);
    const activityResponse = await invoke(cycles.listProjectActivity, { params: { id: String(project._id) }, query: { limit: 100 }, user: admin });
    assert.ok(activityResponse.payload.data.length >= 3);
    console.log('OK: PDF/DOCX thật + MongoDB Document Context + Cycle + Label + Activity hoạt động đúng.');
  } finally {
    if (story?._id) {
      const stored = await UserStoryDocument.find({ userStory: story._id }).select('+storagePath');
      await Promise.all(stored.map((item) => removeStoredDocument(item.storagePath)));
    }
    if (project?._id) await Promise.all([
      ProjectActivity.deleteMany({ project: project._id }), ProjectLabel.deleteMany({ project: project._id }),
      Sprint.deleteMany({ project: project._id }), UserStoryDocument.deleteMany({ project: project._id }),
      UserStory.deleteMany({ project: project._id }), ProjectMembership.deleteMany({ project: project._id }),
      Project.deleteOne({ _id: project._id }),
    ]);
    if (workspace?._id) await Workspace.deleteOne({ _id: workspace._id });
    if (admin?._id) await User.deleteOne({ _id: admin._id });
    await mongoose.disconnect();
  }
};

run().catch((error) => { console.error(error); process.exitCode = 1; });
