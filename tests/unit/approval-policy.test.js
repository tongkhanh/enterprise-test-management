const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveApprovalMode, roleHasResponsibility } = require('../../services/approvalPolicyService');

test('business responsibility accepts canonical and legacy Business Owner labels', () => {
  assert.equal(roleHasResponsibility('Business_Owner', 'Business'), true);
  assert.equal(roleHasResponsibility('Business Owner', 'Business'), true);
  assert.equal(roleHasResponsibility('BO', 'Business'), true);
  assert.equal(roleHasResponsibility('QA', 'Business'), false);
});

test('approval policy requires an independent qualified reviewer when available', () => {
  const result = resolveApprovalMode({ actor: 'qa-2', creator: 'qa-1', workspaceOwner: 'owner', qualified: ['qa-1', 'qa-2'], responsibility: 'QA' });
  assert.equal(result.mode, 'Standard');
  assert.throws(() => resolveApprovalMode({ actor: 'qa-1', creator: 'qa-1', workspaceOwner: 'owner', qualified: ['qa-1', 'qa-2'], responsibility: 'QA', reason: 'Muốn tự duyệt' }), /QA khác người tạo/);
});

test('Workspace Owner is the fallback when the required role is missing', () => {
  const result = resolveApprovalMode({ actor: 'owner', creator: 'qa-1', workspaceOwner: 'owner', qualified: ['qa-1'], responsibility: 'QA' });
  assert.equal(result.mode, 'OwnerFallback');
  assert.match(result.reason, /Owner duyệt thay/);
});

test('Business Owner can review QA artefacts only when no independent QA exists', () => {
  const fallback = resolveApprovalMode({ actor: 'bo-1', creator: 'owner', workspaceOwner: 'owner', qualified: [], fallbackQualified: ['bo-1'], responsibility: 'QA' });
  assert.equal(fallback.mode, 'RoleFallback');
  assert.match(fallback.reason, /Business Owner duyệt thay/);
  assert.throws(() => resolveApprovalMode({ actor: 'bo-1', creator: 'owner', workspaceOwner: 'owner', qualified: ['qa-1'], fallbackQualified: ['bo-1'], responsibility: 'QA' }), /QA khác người tạo/);
});

test('self approval is last resort and requires an explicit reason', () => {
  assert.throws(() => resolveApprovalMode({ actor: 'owner', creator: 'owner', workspaceOwner: 'owner', qualified: ['owner'], responsibility: 'Business', reason: '' }), /tối thiểu 10/);
  const result = resolveApprovalMode({ actor: 'owner', creator: 'owner', workspaceOwner: 'owner', qualified: ['owner'], responsibility: 'Business', reason: 'Project cá nhân chưa có reviewer khác.' });
  assert.equal(result.mode, 'SelfApproval');
  assert.match(result.reason, /Project cá nhân/);
});
