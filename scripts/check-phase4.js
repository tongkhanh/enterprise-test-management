const assert = require('node:assert/strict');
const fs = require('node:fs');
const yaml = require('js-yaml');
const models = require('../models');
const pkg = require('../package.json');

['TestEnvironment', 'EnvironmentBuild', 'EnvironmentSecret', 'ExecutionArtifact', 'AutomationScript', 'AutomationProfile', 'AutomationRun', 'WebhookDelivery', 'AgileIssue'].forEach((name) => assert.ok(models[name], `Missing model ${name}`));
['bullmq', 'ioredis', 'dockerode', 'js-yaml'].forEach((name) => assert.ok(pkg.dependencies[name], `Missing dependency ${name}`));
const compose = yaml.load(fs.readFileSync('docker-compose.yml', 'utf8'));
['redis', 'api', 'environment-worker', 'automation-worker', 'integration-worker'].forEach((name) => assert.ok(compose.services[name], `Missing compose service ${name}`));
const routes = fs.readFileSync('routes/automationLabRoutes.js', 'utf8');
['/commits', '/pulls', '/runtime-files', '/automation-runs', '/execution-artifacts'].forEach((route) => assert.ok(routes.includes(route), `Missing route ${route}`));
const webhookRoutes = fs.readFileSync('routes/webhookRoutes.js', 'utf8');
assert.ok(webhookRoutes.includes('/webhooks/github/') && webhookRoutes.includes('/webhooks/jira/'));
const engines = fs.readFileSync('services/automationScriptService.js', 'utf8');
['Playwright', 'Selenium', 'Cypress', 'WebdriverIO', 'RobotFramework'].forEach((engine) => assert.ok(engines.includes(engine), `Missing engine ${engine}`));
console.log('OK: Phase 4 architecture, queues, workers, webhooks, multi-engine and Agile Issues are wired.');
