const assert = require('assert');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const express = require('express');

// This test never reaches a real service. The Redis client points at a closed
// port, and child servers run in an empty folder so they cannot load backend/.env.
process.env.REDIS_URL = 'redis://127.0.0.1:1';

const pass = (name) => process.stdout.write(`✅ ${name}\n`);

// The failures below are deliberate; their log lines would only look alarming.
console.log = () => {};
console.warn = () => {};
console.error = () => {};

const { startDependencies } = require('../services/startupService');
const redisClient = require('../config/redis');
const Transaction = require('../Models/Transaction');
const transactionRoutes = require('../routes/transactionRoutes');

const SERVER_PATH = path.resolve(__dirname, '..', 'server.js');
const CLOSED_MONGO = 'mongodb://127.0.0.1:1/salx_startup_test';
const CLOSED_REDIS = 'redis://127.0.0.1:1';
const FAST_RETRY = { initialDelayMs: 1, maxDelayMs: 2 };

const within = (ms, promise) => {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Không xong trong ${ms}ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
};

const closedRedis = () => ({ isOpen: false, connect: () => new Promise(() => {}) });

const testRedisNeverBlocks = async () => {
  const events = [];
  await within(1000, startDependencies({
    connectMongo: async () => events.push('mongo'),
    redisClient: closedRedis(),
    startIndexer: async () => events.push('indexer'),
  }));
  assert.deepEqual(events, ['mongo', 'indexer']);
  pass('Redis không kết nối được vẫn không chặn MongoDB và indexer');
};

const testMongoRetries = async () => {
  let attempts = 0;
  let attemptsWhenIndexerStarted = null;
  let indexerStarts = 0;
  await within(1000, startDependencies({
    connectMongo: async () => {
      attempts += 1;
      if (attempts < 3) throw new Error('Server selection timed out');
    },
    redisClient: closedRedis(),
    startIndexer: async () => {
      indexerStarts += 1;
      attemptsWhenIndexerStarted = attempts;
    },
    retry: FAST_RETRY,
  }));
  assert.equal(attempts, 3);
  assert.equal(indexerStarts, 1);
  assert.equal(attemptsWhenIndexerStarted, 3);
  pass('MongoDB lỗi tạm thời được thử lại, indexer chỉ chạy sau khi kết nối xong');
};

const testPermanentMongoError = async () => {
  let attempts = 0;
  let indexerStarted = false;
  const malformed = Object.assign(new Error('Invalid scheme'), { name: 'MongoParseError' });
  await assert.rejects(
    within(1000, startDependencies({
      connectMongo: async () => {
        attempts += 1;
        throw malformed;
      },
      redisClient: closedRedis(),
      startIndexer: async () => {
        indexerStarted = true;
      },
      retry: FAST_RETRY,
    })),
    /Invalid scheme/
  );
  assert.equal(attempts, 1);
  assert.equal(indexerStarted, false);
  pass('Chuỗi kết nối sai định dạng dừng ngay, không thử lại');
};

const testIndexerFailureIsContained = async () => {
  await within(1000, startDependencies({
    connectMongo: async () => {},
    redisClient: closedRedis(),
    startIndexer: async () => {
      throw new Error('RPC down');
    },
  }));
  pass('Indexer lỗi không làm hỏng quá trình khởi động');
};

const testOpenRedisIsNotReconnected = async () => {
  let connects = 0;
  await within(1000, startDependencies({
    connectMongo: async () => {},
    redisClient: {
      isOpen: true,
      connect: async () => {
        connects += 1;
      },
    },
    startIndexer: async () => {},
  }));
  assert.equal(connects, 0);
  pass('Redis đã mở thì không kết nối lại');
};

const testRealRedisClientFailsFast = async () => {
  await within(1000, startDependencies({
    connectMongo: async () => {},
    redisClient,
    startIndexer: async () => {},
  }));
  assert.equal(redisClient.isReady, false);
  await within(1000, assert.rejects(redisClient.get('startup-test')));
  pass('Redis thật ở cổng đóng: không treo, lệnh báo lỗi ngay');
};

const testCacheFailureFallsBackToMongo = async () => {
  // The race this guards: the client looks ready, then the connection drops.
  Object.defineProperty(redisClient, 'isReady', { get: () => true, configurable: true });
  const realFind = Transaction.find;
  Transaction.find = () => ({ sort: async () => [{ txHash: '0xabc' }] });

  const app = express();
  app.use('/api/transactions', transactionRoutes);
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));

  try {
    const { port } = server.address();
    const response = await within(
      5000,
      fetch(`http://127.0.0.1:${port}/api/transactions/history/0xABC`)
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), [{ txHash: '0xabc' }]);
    pass('Lỗi cache khi đọc và ghi vẫn trả dữ liệu từ MongoDB');
  } finally {
    Transaction.find = realFind;
    delete redisClient.isReady;
    await new Promise((resolve) => server.close(resolve));
  }
};

const freePort = () => new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once('error', reject);
  probe.listen(0, () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});

const startChild = (cwd, env) => {
  const child = spawn(process.execPath, [SERVER_PATH], {
    cwd,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const exited = new Promise((resolve) => child.once('exit', resolve));
  return { child, exited, output: () => output };
};

const waitForLive = async (port, running, timeoutMs = 30000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    assert.equal(running.child.exitCode, null, `Server đã thoát:\n${running.output()}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health/live`);
      if (response.ok) return;
    } catch {
      // Port not open yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Cổng không mở sau ${timeoutMs}ms:\n${running.output()}`);
};

const testServerOpensPortWithoutDependencies = async (cwd) => {
  const port = await freePort();
  const running = startChild(cwd, {
    PORT: String(port),
    MONGODB_URI: CLOSED_MONGO,
    REDIS_URL: CLOSED_REDIS,
  });

  try {
    await waitForLive(port, running);

    const response = await within(20000, fetch(`http://127.0.0.1:${port}/api/health`));
    assert.equal(response.status, 503);
    const report = await response.json();
    assert.equal(report.components.mongo.status, 'down');
    assert.equal(report.components.redis.status, 'down');
    assert.equal(running.child.exitCode, null);
    assert.ok(!running.output().includes('indexer đang đồng bộ'), 'Indexer không được chạy khi chưa có MongoDB');
    pass('server.js mở cổng và báo đúng trạng thái khi MongoDB và Redis đều lỗi');
  } finally {
    running.child.kill();
    await running.exited;
  }
};

const assertExitsWithError = async (running, label) => {
  const code = await within(30000, running.exited);
  assert.equal(code, 1, `${label}: exit ${code}\n${running.output()}`);
};

const testMissingMongoUriStopsServer = async (cwd) => {
  const running = startChild(cwd, { PORT: String(await freePort()), REDIS_URL: CLOSED_REDIS });
  await assertExitsWithError(running, 'Thiếu MONGODB_URI');
  assert.ok(!running.output().includes('Server đang chạy'));
  pass('Thiếu MONGODB_URI: dừng trước khi mở cổng');
};

const testMalformedMongoUriStopsServer = async (cwd) => {
  const running = startChild(cwd, {
    PORT: String(await freePort()),
    MONGODB_URI: 'http://not-mongo',
    REDIS_URL: CLOSED_REDIS,
  });
  await assertExitsWithError(running, 'MONGODB_URI sai định dạng');
  pass('MONGODB_URI sai định dạng: dừng hẳn');
};

const testBusyPortStopsServer = async (cwd) => {
  const blocker = net.createServer();
  await new Promise((resolve) => blocker.listen(0, resolve));
  try {
    const running = startChild(cwd, {
      PORT: String(blocker.address().port),
      MONGODB_URI: CLOSED_MONGO,
      REDIS_URL: CLOSED_REDIS,
    });
    await assertExitsWithError(running, 'Cổng đã bị chiếm');
    assert.ok(!running.output().includes('Server đang chạy'));
    pass('Cổng đã bị chiếm: dừng và không chạy tiếp');
  } finally {
    await new Promise((resolve) => blocker.close(resolve));
  }
};

const run = async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'salx-startup-test-'));
  try {
    await testRedisNeverBlocks();
    await testMongoRetries();
    await testPermanentMongoError();
    await testIndexerFailureIsContained();
    await testOpenRedisIsNotReconnected();
    await testRealRedisClientFailsFast();
    await testCacheFailureFallsBackToMongo();
    await testServerOpensPortWithoutDependencies(cwd);
    await testMissingMongoUriStopsServer(cwd);
    await testMalformedMongoUriStopsServer(cwd);
    await testBusyPortStopsServer(cwd);
    pass('Startup test passed');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
};

run()
  .then(() => process.exit(0))
  .catch((error) => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exit(1);
  });
