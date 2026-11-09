const { AppError } = require('../utils/http');

const sameId = (left, right) => String(left?._id || left || '') === String(right?._id || right || '');

/**
 * GitHub credentials belong to a Workspace and can be reused by every Project
 * in that Workspace. The legacy `project` field is intentionally ignored for
 * GitHub so existing connections become shareable without rewriting secrets.
 */
const githubConnectionSupportsProject = (connection, project) => Boolean(
  connection
  && project
  && connection.provider === 'GitHub'
  && sameId(connection.workspace, project.workspace),
);

const assertGithubConnectionForProject = (connection, project, { connected = false } = {}) => {
  if (!githubConnectionSupportsProject(connection, project)) {
    throw new AppError('GitHub connection không thuộc Workspace của Project này.', 409);
  }
  if (connected && connection.status !== 'Connected') {
    throw new AppError('Kết nối GitHub chưa được xác thực. Hãy bấm “Kiểm tra” trong Settings trước khi sử dụng.', 409);
  }
  return connection;
};

module.exports = { sameId, githubConnectionSupportsProject, assertGithubConnectionForProject };
