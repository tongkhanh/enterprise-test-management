require('dotenv').config();
const mongoose = require('mongoose');
const { Requirement } = require('../models');
const connectDB = require('../config/db');

async function migrate() {
  await connectDB();
  const duplicates = await Requirement.aggregate([
    { $match: { requirementId: { $type: 'string', $ne: '' } } },
    { $group: { _id: { project: '$project', systemProfile: '$systemProfile', requirementId: '$requirementId' }, ids: { $push: '$_id' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 20 },
  ]);
  if (duplicates.length) throw new Error(`Không thể tạo unique index theo đợt: có ${duplicates.length} mã Requirement bị trùng trong cùng đợt.`);
  await Requirement.collection.dropIndex('project_1_requirementId_1').catch((error) => {
    if (error.codeName !== 'IndexNotFound') throw error;
  });
  await Requirement.collection.createIndex(
    { project: 1, systemProfile: 1, requirementId: 1 },
    { unique: true, sparse: true, name: 'project_1_systemProfile_1_requirementId_1' },
  );
  console.log('Đã chuyển unique Requirement ID về phạm vi Project + đợt tài liệu.');
  await mongoose.disconnect();
}

migrate().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
