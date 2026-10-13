const router = require('express').Router();
const c = require('../controllers/webhookController');
const { asyncHandler } = require('../middleware/error');
router.post('/webhooks/github/:integrationId', asyncHandler(c.github));
router.post('/webhooks/jira/:integrationId', asyncHandler(c.jira));
module.exports = router;
