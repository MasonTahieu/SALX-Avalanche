// Kết nối MongoDB, Redis và chạy indexer SAU KHI cổng HTTP đã mở. Dịch vụ phụ
// chậm hoặc lỗi chỉ làm dữ liệu đến muộn, không chặn cổng và không tắt server.

const RETRY_INITIAL_DELAY_MS = 5000;
const RETRY_MAX_DELAY_MS = 60000;

// Chuỗi kết nối sai định dạng không tự hết lỗi, thử lại chỉ che mất vấn đề.
const isPermanentMongoError = (error) => error?.name === 'MongoParseError';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const connectMongoWithRetry = async ({
  connect,
  initialDelayMs = RETRY_INITIAL_DELAY_MS,
  maxDelayMs = RETRY_MAX_DELAY_MS,
}) => {
  let delayMs = initialDelayMs;

  for (let attempt = 1; ; attempt += 1) {
    try {
      await connect();
      return;
    } catch (error) {
      if (isPermanentMongoError(error)) throw error;

      console.warn(
        `⚠️ Chưa kết nối được MongoDB (lần ${attempt}): ${error.message}. Thử lại sau ${delayMs / 1000}s`
      );
      await wait(delayMs);
      delayMs = Math.min(delayMs * 2, maxDelayMs);
    }
  }
};

// connect() không kết thúc khi Redis không truy cập được, nên không được await.
const connectRedisInBackground = (client) => {
  if (client.isOpen) return;

  client
    .connect()
    .then(() => console.log('✅ Đã kết nối Redis'))
    .catch((error) => {
      console.warn(`⚠️ Redis không khả dụng, tiếp tục không cache: ${error.message}`);
    });
};

const startDependencies = async ({ connectMongo, redisClient, startIndexer, retry }) => {
  connectRedisInBackground(redisClient);

  console.log('⏳ Đang kết nối MongoDB...');
  await connectMongoWithRetry({ connect: connectMongo, ...retry });
  console.log('✅ Đã kết nối MongoDB');

  // Indexer ghi vào MongoDB nên chỉ chạy khi đã kết nối; lỗi của nó không được
  // làm API ngừng phục vụ.
  startIndexer().catch((error) => {
    console.error('❌ Blockchain indexer khởi động thất bại:', error?.message || error);
  });
};

module.exports = { startDependencies };
