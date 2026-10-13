require('dotenv').config();
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const {
  User, Workspace, Project, Team, ProjectMembership,
  ProjectInvitation, IntegrationConnection, IntegrationSyncLog,
} = require('../models');
const auth = require('../controllers/authController');
const collaboration = require('../controllers/collaborationController');
const report = require('../controllers/reportController');

const invoke = async (handler, req) => {
  let payload; let statusCode = 200;
  const res = { status(value) { statusCode = value; return this; }, json(value) { payload = value; return this; } };
  await handler(req, res);
  return { statusCode, payload };
};

const run = async () => {
  if (!process.env.MONGODB_URI) throw new Error('Thiếu MONGODB_URI.');
  await mongoose.connect(process.env.MONGODB_URI);
  await auth.ensureRoles();
  const fixture = new mongoose.Types.ObjectId().toHexString().slice(-8);
  const email = `step1-${fixture}@example.test`;
  let admin; let workspace; let project; let team; let invitation; let acceptedUser; let integration;
  try {
    const adminRole = await mongoose.model('Role').findOne({ name: 'Admin', workspace: null });
    admin = await User.create({ fullName: 'Step 1 Admin', email: `step1-admin-${fixture}@example.test`, passwordHash: await bcrypt.hash('Fixture@2026', 4), role: adminRole._id });
    await admin.populate('role');
    workspace = await Workspace.create({ name: `Step 1 ${fixture}`, slug: `step-1-${fixture}`, owner: admin._id, maxMembers: 10 });
    admin.workspace = workspace._id;
    await admin.save({ validateBeforeSave: false });
    project = await Project.create({ name: `Invite Flow ${fixture}`, key: `S${fixture.slice(-6)}`.toUpperCase(), workspace: workspace._id, lead: admin._id, members: [admin._id] });
    await ProjectMembership.create({ project: project._id, user: admin._id, role: 'Admin' });

    const teamResponse = await invoke(collaboration.createTeam, {
      body: { project: String(project._id), name: 'QA Automation', key: 'QAAUTO', color: '#5B4EF2' },
      user: admin,
    });
    assert.equal(teamResponse.statusCode, 201);
    team = teamResponse.payload.data;

    const inviteResponse = await invoke(collaboration.createInvitation, {
      params: { id: String(project._id) },
      body: { email, role: 'QA_Lead', team: String(team._id) },
      user: admin,
    });
    assert.equal(inviteResponse.statusCode, 201);
    invitation = inviteResponse.payload.data.invitation;
    const firstToken = new URL(inviteResponse.payload.data.inviteUrl).searchParams.get('token');
    assert.ok(firstToken);

    const resendResponse = await invoke(collaboration.resendInvitation, { params: { id: String(invitation._id) }, user: admin });
    assert.equal(resendResponse.statusCode, 200);
    const token = new URL(resendResponse.payload.data.inviteUrl).searchParams.get('token');
    assert.ok(token);
    await assert.rejects(() => invoke(collaboration.getPublicInvitation, { params: { token: firstToken } }), /không tồn tại/i);

    const publicResponse = await invoke(collaboration.getPublicInvitation, { params: { token } });
    assert.equal(publicResponse.payload.data.email, email);
    assert.equal(publicResponse.payload.data.role, 'QA_Lead');

    const acceptResponse = await invoke(collaboration.acceptInvitation, {
      params: { token }, body: { fullName: 'Step 1 QA Lead', password: 'QaLead@2026' },
    });
    assert.equal(acceptResponse.statusCode, 200);
    acceptedUser = await User.findOne({ email });
    assert.ok(acceptedUser);
    const membership = await ProjectMembership.findOne({ project: project._id, user: acceptedUser._id });
    assert.equal(membership.role, 'QA_Lead');
    assert.ok(membership.teams.some((id) => String(id) === String(team._id)));

    const integrationResponse = await invoke(collaboration.createIntegration, {
      body: { provider: 'GitHub', displayName: 'Fixture GitHub', project: String(project._id), baseUrl: 'https://api.github.com', externalProjectKey: 'example/repo', accessToken: 'fixture-secret' },
      user: admin,
    });
    assert.equal(integrationResponse.statusCode, 201);
    integration = integrationResponse.payload.data.integration;
    assert.ok(integrationResponse.payload.data.webhookSecret);
    assert.equal(integration.credentialCiphertext, undefined);
    assert.equal(integration.webhookSecretCiphertext, undefined);
    const storedIntegration = await IntegrationConnection.findById(integration._id).select('+credentialCiphertext +webhookSecretCiphertext');
    assert.equal(storedIntegration.hasCredentials, true);
    assert.equal(storedIntegration.hasWebhookSecret, true);
    assert.ok(storedIntegration.credentialCiphertext && !storedIntegration.credentialCiphertext.includes('fixture-secret'));
    assert.ok(storedIntegration.webhookSecretCiphertext && !storedIntegration.webhookSecretCiphertext.includes(integrationResponse.payload.data.webhookSecret));

    const rotatedResponse = await invoke(collaboration.rotateIntegrationWebhook, { params: { id: String(integration._id) }, user: admin });
    assert.notEqual(rotatedResponse.payload.data.webhookSecret, integrationResponse.payload.data.webhookSecret);

    const dashboardResponse = await invoke(report.overview, { query: {}, user: admin });
    assert.equal(dashboardResponse.statusCode, 200);
    assert.ok(dashboardResponse.payload.data.counts.projects >= 1);
    assert.ok(dashboardResponse.payload.data.counts.teams >= 1);
    console.log('OK: Dashboard + Team + resend/accept invite + encrypted Integration/webhook hoạt động đúng.');
  } finally {
    if (project?._id) {
      await Promise.all([
        IntegrationSyncLog.deleteMany({ project: project._id }),
        IntegrationConnection.deleteMany({ project: project._id }),
        ProjectInvitation.deleteMany({ project: project._id }),
        ProjectMembership.deleteMany({ project: project._id }),
        Team.deleteMany({ project: project._id }),
        Project.deleteOne({ _id: project._id }),
      ]);
    }
    if (workspace?._id) await Workspace.deleteOne({ _id: workspace._id });
    const userIds = [admin?._id, acceptedUser?._id].filter(Boolean);
    if (userIds.length) await User.deleteMany({ _id: { $in: userIds } });
    await mongoose.disconnect();
  }
};

run().catch((error) => { console.error(error); process.exitCode = 1; });
