const mongoose = require('mongoose');
const { DocumentImportBatch, Requirement, UseCase, UserStory, TestPlan, TestCase, SystemProfile } = require('../models');
const { AppError, send } = require('../utils/http');
const { assertProjectAccess } = require('../services/projectAccessService');

const listImportBatches = async (req, res) => {
  if (!req.query.systemProfile) throw new AppError('System Profile là bắt buộc.', 400);
  const profile = await SystemProfile.findById(req.query.systemProfile).select('project');
  if (!profile) throw new AppError('System Profile không tồn tại.', 404);
  await assertProjectAccess(req.user, profile.project);
  const filter = { status: 'Completed', systemProfile: profile._id };
  if (req.query.artifactType) filter.artifactType = req.query.artifactType;
  const rows = await DocumentImportBatch.find(filter).sort('-createdAt').limit(20).lean();
  send(res, rows);
};

const rollbackImportBatch = async (req, res) => {
  const batch = await DocumentImportBatch.findById(req.params.id);
  if (!batch) throw new AppError('Lần nhập không tồn tại.', 404);
  await assertProjectAccess(req.user, batch.project, { manage: true });
  if (batch.status !== 'Completed') throw new AppError('Lần nhập này đã được hoàn tác hoặc ngừng áp dụng.', 409);
  const Model = batch.artifactType === 'Requirement' ? Requirement : UseCase;
  const artifacts = await Model.find({ _id: { $in: batch.createdArtifactIds } }).select('_id status');
  const ids = artifacts.map((item) => item._id);
  let referenceCount = 0;
  if (batch.artifactType === 'Requirement' && ids.length) {
    const counts = await Promise.all([
      UseCase.countDocuments({ requirements: { $in: ids } }),
      UserStory.countDocuments({ $or: [{ parentRequirements: { $in: ids } }, { 'e2e.requirements': { $in: ids } }] }),
      TestPlan.countDocuments({ requirements: { $in: ids } }),
      TestCase.countDocuments({ 'e2e.requirements': { $in: ids } }),
    ]);
    referenceCount = counts.reduce((sum, value) => sum + value, 0);
  } else if (ids.length) {
    const counts = await Promise.all([
      UserStory.countDocuments({ $or: [{ 'e2e.useCase': { $in: ids } }, { 'e2e.useCases': { $in: ids } }] }),
      TestPlan.countDocuments({ useCases: { $in: ids } }),
      TestCase.countDocuments({ 'e2e.useCase': { $in: ids } }),
    ]);
    referenceCount = counts.reduce((sum, value) => sum + value, 0);
  }
  const canDelete = referenceCount === 0 && artifacts.every((item) => item.status === 'Draft');
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      if (canDelete) {
        await Model.deleteMany({ _id: { $in: ids } }, { session });
        for (const change of batch.updatedArtifacts || []) {
          const before = change.before && typeof change.before === 'object' ? change.before : null;
          if (before) await Requirement.replaceOne({ _id: change.artifactId }, before, { session });
        }
        batch.status = 'RolledBack';
        batch.rollbackMode = 'Deleted';
      } else {
        await Model.updateMany({ _id: { $in: ids } }, { $set: { status: 'Retired' } }, { session });
        batch.status = 'Retired';
        batch.rollbackMode = 'Retired';
      }
      batch.rolledBackBy = req.user._id;
      batch.rolledBackAt = new Date();
      await batch.save({ session });
    });
  } finally {
    await session.endSession();
  }
  send(res, { batchId: batch._id, artifactCount: artifacts.length, referenceCount, mode: batch.rollbackMode }, 200, { message: canDelete ? `Đã hoàn tác và xóa ${artifacts.length} bản nháp chưa được tham chiếu.` : `Không thể xóa an toàn; đã chuyển ${artifacts.length} tài liệu sang Retired và giữ nguyên truy vết.` });
};

module.exports = { listImportBatches, rollbackImportBatch };
