const express = require('express');
const Transaction = require('../Models/Transaction');
const redisClient = require('../config/redis');
const { getProvider } = require('../services/blockchainService');
const { buildProofReport } = require('../services/proofService');

const router = express.Router();
const CACHE_KEY = 'public_proof_report';
const CACHE_SECONDS = 120;

const loadEvents = (chainId) => (limit) => Transaction.find({
  chainId,
  $or: [
    { eventName: 'SALPurchased' },
    { transactionType: { $in: ['RETIRE', 'MINT'] } },
  ],
})
  .sort({ timestamp: -1, logIndex: -1 })
  .limit(limit)
  .select('eventName transactionType txHash blockNumber timestamp')
  .lean();

router.get('/', async (req, res) => {
  try {
    if (redisClient.isReady) {
      const cached = await redisClient.get(CACHE_KEY).catch(() => null);
      if (cached) return res.status(200).json(JSON.parse(cached));
    }

    const chainId = Number(process.env.CHAIN_ID || 43113);
    const report = await buildProofReport({
      loadEvents: loadEvents(chainId),
      provider: getProvider(),
      chainId,
    });

    if (redisClient.isReady && report.rpcAvailable) {
      await redisClient.setEx(CACHE_KEY, CACHE_SECONDS, JSON.stringify(report)).catch(() => {});
    }
    return res.status(200).json(report);
  } catch (error) {
    console.error('❌ Lỗi tạo báo cáo proof:', error.message);
    return res.status(503).json({ error: 'Chưa tải được số liệu on-chain' });
  }
});

module.exports = router;
