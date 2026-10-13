require('dotenv').config();
const mongoose = require('mongoose');
const { Worker } = require('bullmq');
const connectDB = require('../config/db');
const { connection } = require('../services/queueService');
const { executeWithRetries } = require('../services/multiEngineRunnerService');

if (!connection) throw new Error('REDIS_URL là bắt buộc để chạy Automation Worker.');
connectDB().then(() => {
  require('../services/automationResourcesService').startHeartbeat('automation');
  const worker = new Worker('etms-automation', (job) => executeWithRetries(job.data.runId, (progress) => job.updateProgress(progress)), {
    connection, concurrency: Number(process.env.AUTOMATION_WORKER_CONCURRENCY || 2), lockDuration: 10 * 60 * 1000,
  });
  worker.on('failed', (job, error) => console.error(`[AutomationWorker] ${job?.id}: ${error.message}`));
  console.log('Automation Worker ready');
});
process.on('SIGTERM', () => mongoose.disconnect());
