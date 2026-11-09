const test = require('node:test');
const assert = require('node:assert/strict');
const {
  githubConnectionSupportsProject,
  assertGithubConnectionForProject,
} = require('../../services/integrationScopeService');

test('GitHub connection is reusable by Projects in the same Workspace', () => {
  const connection = {
    provider: 'GitHub',
    workspace: 'workspace-a',
    project: 'legacy-project-a',
    status: 'Connected',
  };

  assert.equal(
    githubConnectionSupportsProject(connection, { _id: 'project-b', workspace: 'workspace-a' }),
    true,
  );
  assert.doesNotThrow(() => assertGithubConnectionForProject(
    connection,
    { _id: 'project-b', workspace: 'workspace-a' },
    { connected: true },
  ));
});

test('GitHub connection cannot cross Workspace boundaries', () => {
  const connection = { provider: 'GitHub', workspace: 'workspace-a', status: 'Connected' };
  assert.equal(
    githubConnectionSupportsProject(connection, { _id: 'project-b', workspace: 'workspace-b' }),
    false,
  );
  assert.throws(
    () => assertGithubConnectionForProject(connection, { workspace: 'workspace-b' }),
    /không thuộc Workspace/,
  );
});

test('GitHub connection must be verified before use', () => {
  const connection = { provider: 'GitHub', workspace: 'workspace-a', status: 'Configured' };
  assert.throws(
    () => assertGithubConnectionForProject(connection, { workspace: 'workspace-a' }, { connected: true }),
    /chưa được xác thực/,
  );
});
