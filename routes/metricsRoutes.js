const crypto = require('node:crypto');
const router = require('express').Router();
const { asyncHandler } = require('../middleware/error');
const { metrics } = require('../controllers/automationResourcesController');
router.get('/metrics', (req, res, next) => {
  const configured = process.env.METRICS_TOKEN || (process.env.METRICS_TOKEN_FILE ? require('node:fs').readFileSync(process.env.METRICS_TOKEN_FILE, 'utf8').trim() : '');
  const token = String(req.headers.authorization || '').replace(/^Bearer /, '');
  const a = Buffer.from(configured); const b = Buffer.from(token);
  if (a.length < 32 || a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ success: false, error: 'Metrics token không hợp lệ.' });
  req.metricsAuthorized = true; next();
}, asyncHandler(metrics));
module.exports = router;
