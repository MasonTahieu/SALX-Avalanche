const redis = require('redis');

const RECONNECT_MAX_DELAY_MS = 30000;

// Redis chỉ là cache: lệnh báo lỗi ngay khi mất kết nối thay vì xếp hàng chờ,
// còn client tự kết nối lại ở nền với khoảng cách tăng dần.
const redisClient = redis.createClient({
    url: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
    disableOfflineQueue: true,
    socket: {
        reconnectStrategy: (retries) => Math.min(1000 * 2 ** retries, RECONNECT_MAX_DELAY_MS),
    },
});

redisClient.on('error', (err) => console.error('❌ Lỗi kết nối Redis:', err.message));
redisClient.on('connect', () => console.log('✅ Đã kết nối thành công với Redis Cache!'));

module.exports = redisClient;