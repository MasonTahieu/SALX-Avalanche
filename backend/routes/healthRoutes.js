const express = require('express');
const { getHealthReport } = require('../services/healthService');

const router = express.Router();

// Cheap liveness probe: no database or RPC calls. Used by the frontend to wake
// the server early and by the keep-alive workflow, so neither waits on the
// full report below (which checks MongoDB, Redis and the chain).
router.get('/live', (req, res) => {
  res.set('Cache-Control', 'no-store');
  return res.status(200).json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) });
});

router.get('/', async (req, res) => {
  try {
    const report = await getHealthReport();
    res.set('Cache-Control', 'no-store');
    return res.status(report.status === 'unhealthy' ? 503 : 200).json(report);
  } catch (error) {
    console.error('❌ Health check thất bại:', error.message);
    return res.status(503).json({
      status: 'unhealthy',
      checkedAt: new Date(),
      error: error.message,
    });
  }
});

module.exports = router;
