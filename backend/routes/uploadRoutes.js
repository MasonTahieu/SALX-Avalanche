const express = require('express');
const router = express.Router();
const multer = require('multer');
const { pinBufferToIPFS } = require('../services/ipfsService');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
});

router.post('/ipfs', upload.single('document'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Vui lòng đính kèm file (key: document)' });
        }

        const result = await pinBufferToIPFS({
            buffer: req.file.buffer,
            filename: req.file.originalname,
            contentType: req.file.mimetype,
        });

        res.status(200).json({
            message: 'Đẩy báo cáo lên IPFS thành công!',
            ipfsHash: result.cid,
            timestamp: result.timestamp,
        });

    } catch (error) {
        console.error('Lỗi upload IPFS:', error.response?.data || error.message);
        res.status(500).json({ error: 'Lỗi hệ thống khi tải file lên mạng lưới' });
    }
});

module.exports = router;
