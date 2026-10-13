require('dotenv').config();
const mongoose = require('mongoose');
const { Team, Project } = require('../models');
const connectDB = require('../config/db');

async function migrate() {
  await connectDB();
  await Team.collection.dropIndex('project_1_key_1').catch(() => null);
  const legacy = await Team.find({ project: { $ne: null } }).select('_id project workspace projects');
  for (const team of legacy) {
    const project = await Project.findById(team.project).select('workspace teams');
    if (!project) continue;
    team.workspace = project.workspace;
    team.projects = [...new Set([...(team.projects || []).map(String), String(project._id)])];
    await team.save();
    await Project.updateOne({ _id: project._id }, { $addToSet: { teams: team._id } });
  }
  console.log(`Đã chuẩn hóa ${legacy.length} Team theo Workspace/Project relation.`);
  await mongoose.disconnect();
}
migrate().catch((error) => { console.error(error.message); process.exitCode = 1; });
