const nodemailer = require('nodemailer');
const { AppError } = require('../utils/http');

let transporter;
const getTransporter = () => {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) throw new AppError('Chưa cấu hình SMTP_HOST, SMTP_USER và SMTP_PASS.', 503);
  if (!transporter) transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporter;
};

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

const sendReportEmail = async ({ report, summary }) => {
  const rows = Object.entries(summary).map(([key, value]) => `<tr><td>${escapeHtml(key)}</td><td>${escapeHtml(typeof value === 'object' ? JSON.stringify(value) : value)}</td></tr>`).join('');
  const html = `<h2>${escapeHtml(report.name)}</h2><p>Loại báo cáo: ${escapeHtml(report.reportType)}</p><table border="1" cellpadding="8" cellspacing="0">${rows}</table><p>Tạo lúc ${new Date().toLocaleString('vi-VN')}</p>`;
  const csv = ['metric,value', ...Object.entries(summary).map(([key, value]) => `"${String(key).replace(/"/g, '""')}","${String(typeof value === 'object' ? JSON.stringify(value) : value).replace(/"/g, '""')}"`)].join('\n');
  return getTransporter().sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: report.recipients.join(','), subject: `[ETMS] ${report.name}`, html,
    attachments: [{ filename: `${report.reportType}-${new Date().toISOString().slice(0, 10)}.csv`, content: Buffer.from(`\uFEFF${csv}`, 'utf8'), contentType: 'text/csv' }],
  });
};

const sendProjectInvitationEmail = async ({ invitation, inviter, project, team, inviteUrl }) => {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return { delivered: false, skipped: true, reason: 'SMTP chưa được cấu hình.' };
  }
  const teamText = team ? `<p>Team: <strong>${escapeHtml(team.name)}</strong></p>` : '';
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:auto;color:#171829">
      <p style="font-size:12px;letter-spacing:.12em;color:#5b4ef2;font-weight:700">ETMS WORKSPACE</p>
      <h2>Bạn được mời tham gia ${escapeHtml(project.name)}</h2>
      <p>${escapeHtml(inviter.fullName || inviter.email)} đã mời bạn tham gia Project với vai trò <strong>${escapeHtml(invitation.role)}</strong>.</p>
      ${teamText}
      <p style="margin:28px 0"><a href="${escapeHtml(inviteUrl)}" style="background:#5b4ef2;color:white;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600">Chấp nhận lời mời</a></p>
      <p style="font-size:13px;color:#6d7184">Liên kết hết hạn vào ${new Date(invitation.expiresAt).toLocaleString('vi-VN')} và chỉ sử dụng được một lần.</p>
    </div>`;
  const info = await getTransporter().sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: invitation.email,
    subject: `[ETMS] Lời mời tham gia ${project.name}`,
    html,
  });
  return { delivered: true, messageId: info.messageId };
};

const sendWorkspaceInvitationEmail = async ({ invitation, inviter, workspace, inviteUrl }) => {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return { delivered: false, skipped: true, reason: 'SMTP chưa được cấu hình.' };
  }
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:auto;color:#171829">
      <p style="font-size:12px;letter-spacing:.12em;color:#5b4ef2;font-weight:700">ETMS WORKSPACE</p>
      <h2>Bạn được mời tham gia ${escapeHtml(workspace.name)}</h2>
      <p>${escapeHtml(inviter.fullName || inviter.email)} đã mời bạn với vai trò <strong>${escapeHtml(invitation.role)}</strong> trong Workspace.</p>
      <p style="margin:28px 0"><a href="${escapeHtml(inviteUrl)}" style="background:#5b4ef2;color:white;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600">Chấp nhận lời mời</a></p>
      <p style="font-size:13px;color:#6d7184">Liên kết hết hạn vào ${new Date(invitation.expiresAt).toLocaleString('vi-VN')} và chỉ sử dụng được một lần.</p>
    </div>`;
  const info = await getTransporter().sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: invitation.email,
    subject: `[ETMS] Lời mời tham gia Workspace ${workspace.name}`,
    html,
  });
  return { delivered: true, messageId: info.messageId };
};

module.exports = { sendReportEmail, sendProjectInvitationEmail, sendWorkspaceInvitationEmail };
