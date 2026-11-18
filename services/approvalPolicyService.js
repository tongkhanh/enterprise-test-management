const { Project, ProjectMembership } = require('../models');
const { AppError } = require('../utils/http');

const BUSINESS_ROLES = new Set(['Business_Owner', 'Product_Owner', 'Business_Analyst']);
const QA_ROLES = new Set(['QA', 'QA_Manager', 'Tester']);

const idOf = (value) => String(value?._id || value || '');
const roleKey = (value) => String(value || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
const roleHasResponsibility = (value, responsibility, { includeOwner = true } = {}) => {
  const key = roleKey(value);
  if (includeOwner && key === 'owner') return true;
  const allowed = responsibility === 'Business'
    ? new Set(['businessowner', 'productowner', 'businessanalyst', 'bo', 'po', 'ba'])
    : new Set(['qa', 'qamanager', 'tester']);
  return allowed.has(key);
};

const approvalException = (mode, reason, responsibility) => ({
  mode,
  reason: String(reason || '').trim().slice(0, 2000),
  responsibility,
  recordedAt: new Date(),
});

const resolveApprovalEligibility = ({ actor, creator, workspaceOwner, qualified = [], fallbackQualified = [], responsibility }) => {
  const independent = qualified.filter((id) => id !== creator);
  if (independent.length) {
    return {
      canApprove: independent.includes(actor), mode: 'Standard', requiresReason: false,
      message: independent.includes(actor) ? '' : `Tài liệu phải được một ${responsibility === 'Business' ? 'Business Owner' : 'QA'} khác người tạo duyệt.`,
    };
  }
  const independentFallback = fallbackQualified.filter((id) => id !== creator);
  if (independentFallback.length) {
    const fallbackName = responsibility === 'QA' ? 'Business Owner' : 'QA';
    return {
      canApprove: independentFallback.includes(actor), mode: 'RoleFallback', requiresReason: false,
      reason: `Project không có ${responsibility === 'Business' ? 'Business Owner' : 'QA'} độc lập; ${fallbackName} duyệt thay theo ngoại lệ Project nhỏ.`,
      message: independentFallback.includes(actor) ? '' : `Project không có reviewer chính; yêu cầu này được giao cho ${fallbackName} duyệt thay.`,
    };
  }
  if (actor === workspaceOwner && actor !== creator) return { canApprove: true, mode: 'OwnerFallback', requiresReason: false, reason: `Project không có ${responsibility === 'Business' ? 'Business Owner' : 'QA'} độc lập; Workspace Owner duyệt thay.` };
  if (actor === creator && (actor === workspaceOwner || qualified.includes(actor) || fallbackQualified.includes(actor))) {
    return { canApprove: true, mode: 'SelfApproval', requiresReason: true, message: 'Project không có reviewer độc lập. Hãy nhập lý do tự duyệt tối thiểu 10 ký tự.' };
  }
  return { canApprove: false, mode: null, requiresReason: false, message: workspaceOwner ? 'Project thiếu reviewer phù hợp; Workspace Owner cần duyệt thay.' : 'Project chưa có người chịu trách nhiệm duyệt phù hợp.' };
};

const resolveApprovalMode = ({ actor, creator, workspaceOwner, qualified = [], fallbackQualified = [], responsibility, reason }) => {
  const eligibility = resolveApprovalEligibility({ actor, creator, workspaceOwner, qualified, fallbackQualified, responsibility });
  if (!eligibility.canApprove) throw new AppError(eligibility.message, 403);
  if (eligibility.requiresReason) {
    const explicitReason = String(reason || '').trim();
    if (explicitReason.length < 10) throw new AppError('Project không có reviewer độc lập. Hãy nhập lý do tự duyệt tối thiểu 10 ký tự.', 400, { code: 'SELF_APPROVAL_REASON_REQUIRED' });
    return approvalException('SelfApproval', explicitReason, responsibility);
  }
  return approvalException(eligibility.mode, eligibility.reason || '', responsibility);
};

/**
 * Enforces maker-checker when the Project has an independent qualified
 * reviewer. If it does not, the Workspace Owner is the fallback. Self-review
 * is the final option and always requires an explicit reason.
 */
const approvalContext = async ({ projectId, actorId, creatorId, responsibility, fallbackResponsibility }) => {
  const project = await Project.findById(projectId).select('workspace owner');
  if (!project) throw new AppError('Project không tồn tại.', 404);
  // Approval responsibility is Project-scoped. A stale or broader Workspace
  // role must never override the member's explicit role in this Project.
  const projectMemberships = await ProjectMembership.find({ project: project._id, isActive: true }).select('user role');
  const actor = idOf(actorId);
  const creator = idOf(creatorId);
  const owner = idOf(project.owner);
  // Workspace ownership is authoritative; older Projects may not retain an
  // owner field, so resolve it from the Workspace when necessary.
  const workspaceOwner = owner || idOf((await require('../models').Workspace.findById(project.workspace).select('owner'))?.owner);
  const qualified = [...new Set(projectMemberships
    .filter((item) => roleHasResponsibility(item.role, responsibility, { includeOwner: false }))
    .map((item) => idOf(item.user)))];
  const fallbackQualified = fallbackResponsibility ? [...new Set(projectMemberships
    .filter((item) => roleHasResponsibility(item.role, fallbackResponsibility, { includeOwner: false }))
    .map((item) => idOf(item.user)))] : [];
  return { actor, creator, workspaceOwner, qualified, fallbackQualified, responsibility };
};

const getArtifactApprovalEligibility = async (options) => resolveApprovalEligibility(await approvalContext(options));

const authorizeArtifactApproval = async ({ reason, ...options }) => {
  const context = await approvalContext(options);
  return resolveApprovalMode({ ...context, reason });
};

module.exports = { authorizeArtifactApproval, getArtifactApprovalEligibility, resolveApprovalEligibility, resolveApprovalMode, roleHasResponsibility, BUSINESS_ROLES, QA_ROLES };
