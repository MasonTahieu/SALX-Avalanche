const express = require('express');
const router = express.Router();
const multer = require('multer');
const { pinBufferToIPFS } = require('../services/ipfsService');

const MAX_FILE_MB = 5;

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_MB * 1024 * 1024 },
});

// Multer's own errors (file too large, wrong field name) would otherwise reach
// the global handler and come back as a generic 500.
const receiveDocument = (req, res, next) => {
    upload.single('document')(req, res, (error) => {
        if (!error) return next();
        if (error instanceof multer.MulterError) {
            if (error.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({ error: `File vượt quá giới hạn ${MAX_FILE_MB} MB`, code: error.code });
            }
            return res.status(400).json({ error: `File không hợp lệ (${error.code}). Gửi đúng 1 file với key: document`, code: error.code });
        }
        return next(error);
    });
};

router.post('/ipfs', receiveDocument, async (req, res) => {
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
