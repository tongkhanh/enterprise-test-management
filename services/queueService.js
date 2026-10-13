const { Queue } = require('bullmq');
const IORedis = require('ioredis');

const redisUrl = process.env.REDIS_URL || '';
const connection = redisUrl ? new IORedis(redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: true }) : null;
const queues = connection ? {
  environment: new Queue('etms-environment', { connection }),
  automation: new Queue('etms-automation', { connection }),
  integration: new Queue('etms-integration', { connection }),
} : null;

const defaults = { attempts: 3, backoff: { type: 'exponential', delay: 3000 }, removeOnComplete: 200, removeOnFail: 500 };
async function add(queue, name, data, options = {}) {
  if (!queues) return null;
  return queues[queue].add(name, data, { ...defaults, ...options });
}
const enqueueEnvironmentBuild = (buildId) => add('environment', 'provision', { buildId }, { jobId: `environment-${buildId}` });
const enqueueEnvironmentCleanup = (environmentId, delay = 0) => add('environment', 'cleanup', { environmentId }, { delay, jobId: `cleanup-${environmentId}-${Date.now()}` });
const enqueueAutomationRun = (runId) => add('automation', 'execute', { runId }, { jobId: `automation-${runId}` });
const enqueueIntegration = (name, data, options) => add('integration', name, data, options);
const queueMode = () => ({ driver: queues ? 'BullMQ' : 'InProcessFallback', redisConfigured: Boolean(redisUrl) });

module.exports = { connection, queues, enqueueEnvironmentBuild, enqueueEnvironmentCleanup, enqueueAutomationRun, enqueueIntegration, queueMode };
