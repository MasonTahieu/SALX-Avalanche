require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const leaderboardRoutes = require('./routes/leaderboardRoutes');
const projectRoutes = require('./routes/projectRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const userRoutes = require('./routes/userRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const certificateRoutes = require('./routes/certificateRoutes');
const feeRoutes = require('./routes/feeRoutes');
const adminBlockchainRoutes = require('./routes/adminBlockchainRoutes');
const healthRoutes = require('./routes/healthRoutes');
const listingRoutes = require('./routes/listingRoutes');
const proofRoutes = require('./routes/proofRoutes');
const { startBlockchainIndexer } = require('./services/blockchainListener');
const { startDependencies } = require('./services/startupService');
const redisClient = require('./config/redis');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.use('/api/health', healthRoutes);
app.use('/api/status', healthRoutes); // backward-compatible alias

app.use('/api/transactions', transactionRoutes);
app.use('/api/users', userRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/certificates', certificateRoutes);
app.use('/api/fees', feeRoutes);
app.use('/api/admin/blockchain', adminBlockchainRoutes);
app.use('/api/listings', listingRoutes);
app.use('/api/proof', proofRoutes);

app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err);
  res.status(500).json({ error: 'Lỗi hệ thống không xác định' });
});

const PORT = process.env.PORT || 5000;

// Thiếu cấu hình thì không bao giờ tự hết lỗi: dừng trước khi mở cổng để lần
// deploy báo thất bại thay vì "Live" mà không có dữ liệu.
if (!process.env.MONGODB_URI) {
  console.error('❌ Lỗi khởi động hệ thống: thiếu MONGODB_URI');
  process.exit(1);
}

// Mở cổng trước: health và API phản hồi ngay, MongoDB/Redis kết nối ở nền.
// Trong lúc chờ kết nối, truy vấn Mongoose được giữ lại rồi chạy khi kết nối xong.
const server = app.listen(PORT, (listenError) => {
  // Express 5 cũng gọi callback này khi lỗi; listener 'error' bên dưới xử lý.
  if (listenError) return;

  console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);

  startDependencies({
    connectMongo: () =>
      mongoose.connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 30000,
        socketTimeoutMS: 45000,
      }),
    redisClient,
    startIndexer: startBlockchainIndexer,
  }).catch((error) => {
    console.error('❌ Lỗi khởi động hệ thống:', error.message);
    process.exit(1);
  });
});

server.on('error', (error) => {
  console.error('❌ HTTP server khởi động thất bại:', error.message);
  process.exit(1);
});
