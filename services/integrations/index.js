const { AppError } = require('../../utils/http');
const JiraProvider = require('./JiraProvider');
const GitHubProvider = require('./GitHubProvider');
const LinearProvider = require('./LinearProvider');

const providers = { Jira: JiraProvider, GitHub: GitHubProvider, Linear: LinearProvider };

const createIntegrationProvider = ({ connection, credential }) => {
  const Provider = providers[connection.provider];
  if (!Provider) throw new AppError(`Chưa hỗ trợ provider ${connection.provider}.`, 422);
  return new Provider({ connection, credential });
};

module.exports = { createIntegrationProvider, providers };
