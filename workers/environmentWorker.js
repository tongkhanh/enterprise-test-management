require('dotenv').config();
const mongoose = require('mongoose');
const { Worker } = require('bullmq');
const connectDB = require('../config/db');
const { connection } = require('../services/queueService');
const { provisionBuild, cleanupEnvironment } = require('../services/environmentService');

if (!connection) throw new Error('REDIS_URL là bắt buộc để chạy Environment Worker.');
connectDB().then(() => {
  require('../services/automationResourcesService').startHeartbeat('environment');
  const worker = new Worker('etms-environment', async (job) => {
    if (job.name === 'provision') return provisionBuild(job.data.buildId, (progress) => job.updateProgress(progress));
    if (job.name === 'cleanup') return cleanupEnvironment(job.data.environmentId);
    throw new Error(`Environment job không hỗ trợ: ${job.name}`);
  }, { connection, concurrency: Number(process.env.ENVIRONMENT_WORKER_CONCURRENCY || 1), lockDuration: 20 * 60 * 1000 });
  worker.on('failed', (job, error) => console.error(`[EnvironmentWorker] ${job?.id}: ${error.message}`));
  console.log('Environment Worker ready');
});
process.on('SIGTERM', () => mongoose.disconnect());
