const { ProjectActivity } = require('../models');

const recordProjectActivity = async ({ project, actor, action, entityType, entityId, title, description = '', changes = null }) => {
  try {
    return await ProjectActivity.create({ project, actor, action, entityType, entityId, title, description, changes });
  } catch (error) {
    console.error('Project activity error:', error.message);
    return null;
  }
};

module.exports = { recordProjectActivity };
