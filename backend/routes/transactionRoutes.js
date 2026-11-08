const express = require('express');
const router = express.Router();
const Transaction = require('../Models/Transaction');
const redisClient = require('../config/redis');

router.get('/history/:address', async (req, res) => {
  try {
    const address = req.params.address.toLowerCase();
    const cacheKey = `tx_history_${address}`;

    // Lỗi cache không được làm hỏng request: đọc thẳng từ MongoDB.
    if (redisClient.isReady) {
      const cachedData = await redisClient.get(cacheKey).catch(() => null);
      if (cachedData) return res.status(200).json(JSON.parse(cachedData));
    }

    const history = await Transaction.find({
      $or: [{ fromAddress: address }, { toAddress: address }],
    }).sort({ timestamp: -1 });

    if (redisClient.isReady && history.length > 0) {
      await redisClient.setEx(cacheKey, 300, JSON.stringify(history)).catch(() => {});
    }

    res.status(200).json(history);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Lỗi truy xuất lịch sử giao dịch' });
  }
});

router.get('/:txHash', async (req, res) => {
  try {
    const transaction = await Transaction.find({
      txHash: req.params.txHash.toLowerCase(),
    }).sort({ logIndex: 1 });

    if (!transaction.length) {
      return res.status(404).json({ error: 'Không tìm thấy giao dịch' });
    }

    const primary = transaction.find((item) => item.transactionType !== 'BURN') || transaction[0];
    res.status(200).json({ ...primary.toObject(), events: transaction });
  } catch (error) {
    res.status(500).json({ error: 'Không thể tải giao dịch' });
  }
});

module.exports = router;
