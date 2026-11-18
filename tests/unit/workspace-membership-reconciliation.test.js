const test = require('node:test');
const assert = require('node:assert/strict');
const { acceptedInvitationMembershipUpdate } = require('../../services/workspaceAccessService');

test('accepted invitations only initialize a missing membership and never overwrite its current role', () => {
  const acceptedAt = new Date('2026-01-02T03:04:05.000Z');
  const update = acceptedInvitationMembershipUpdate({
    role: 'QA',
    invitedBy: 'inviter-id',
    acceptedAt,
  });

  assert.equal(update.$set, undefined);
  assert.deepEqual(update.$setOnInsert, {
    role: 'QA',
    invitedBy: 'inviter-id',
    isActive: true,
    joinedAt: acceptedAt,
  });
});
