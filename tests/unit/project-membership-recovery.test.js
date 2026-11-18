const test = require('node:test');
const assert = require('node:assert/strict');

const { recoverableProjectRole } = require('../../services/projectAccessService');

test('missing Project membership is recovered from its accepted invitation role', () => {
  assert.equal(recoverableProjectRole({
    existingMembership: null,
    acceptedInvitation: { role: 'Business_Owner' },
    isListedMember: false,
    workspaceRole: 'QA',
  }), 'Business_Owner');
});

test('inactive membership keeps its latest role when Project still lists the user', () => {
  assert.equal(recoverableProjectRole({
    existingMembership: { role: 'Business_Owner', isActive: false },
    acceptedInvitation: { role: 'QA' },
    isListedMember: true,
    workspaceRole: 'QA',
  }), 'Business_Owner');
});

test('membership is never invented without Project or invitation evidence', () => {
  assert.equal(recoverableProjectRole({
    existingMembership: null,
    acceptedInvitation: null,
    isListedMember: false,
    workspaceRole: 'Business_Owner',
  }), null);
});

test('an explicitly removed member is not restored from an old accepted invitation', () => {
  assert.equal(recoverableProjectRole({
    existingMembership: { role: 'Business_Owner', isActive: false },
    acceptedInvitation: { role: 'Business_Owner' },
    isListedMember: false,
    workspaceRole: 'Business_Owner',
  }), null);
});
