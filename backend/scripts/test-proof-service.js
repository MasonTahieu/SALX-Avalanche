const assert = require('assert');
const { buildProofReport, summarizeEvents } = require('../services/proofService');

const GWEI = 1000000000n;

const events = [
  { eventName: 'MultiProjectSALRetired', transactionType: 'RETIRE', txHash: '0xretire', blockNumber: 30, timestamp: new Date('2026-11-05') },
  { eventName: 'SALRetired', transactionType: 'RETIRE', txHash: '0xretire', blockNumber: 30, timestamp: new Date('2026-11-05') },
  { eventName: 'SALPurchased', transactionType: 'TRANSFER', txHash: '0xbuy', blockNumber: 20, timestamp: new Date('2026-11-04') },
  { eventName: 'ListingCancelled', transactionType: 'TRANSFER', txHash: '0xcancel', blockNumber: 14, timestamp: new Date('2026-11-03') },
  { eventName: 'ProjectApproved', transactionType: 'MINT', txHash: '0xmint', blockNumber: 10, timestamp: new Date('2026-11-02') },
];

const fakeProvider = (overrides = {}) => ({
  getBlockNumber: async () => 1000,
  getBlock: async (number) => ({ timestamp: number * 2 }),
  getTransactionReceipt: async (hash) => (hash === '0xbuy'
    ? { gasUsed: 100000n, gasPrice: 2n * GWEI }
    : { gasUsed: 50000n, gasPrice: GWEI }),
  ...overrides,
});

const run = async () => {
  const { counts, transactions } = summarizeEvents(events);
  assert.deepEqual(counts, { MINT: 1, BUY: 1, RETIRE: 1 }, 'a transaction counts once per category');
  assert.ok(!transactions.some((tx) => tx.txHash === '0xcancel'), 'unrelated events are left out');

  const report = await buildProofReport({
    loadEvents: async () => events,
    provider: fakeProvider(),
    chainId: 43113,
  });
  assert.equal(report.latestBlock, 1000);
  assert.deepEqual(report.blockTime, { averageSeconds: 2, sampleBlocks: 100 });
  const buy = report.activity.find((item) => item.type === 'BUY');
  assert.equal(buy.averageGasUsed, 100000);
  assert.equal(buy.averageFeeAvax, '0.0002', 'fee is gas used times gas price');
  assert.equal(report.recent[0].type, 'RETIRE');
  assert.equal(report.recent[0].feeAvax, '0.00005');

  const withoutRpc = await buildProofReport({
    loadEvents: async () => events,
    provider: fakeProvider({ getBlockNumber: async () => { throw new Error('rpc down'); } }),
    chainId: 43113,
  });
  assert.equal(withoutRpc.rpcAvailable, false);
  assert.equal(withoutRpc.blockTime, null);
  assert.equal(withoutRpc.activity.find((item) => item.type === 'BUY').count, 1, 'counts survive an RPC failure');
  assert.equal(withoutRpc.recent[0].feeAvax, null);

  const missingReceipt = await buildProofReport({
    loadEvents: async () => events,
    provider: fakeProvider({ getTransactionReceipt: async () => { throw new Error('not found'); } }),
    chainId: 43113,
  });
  assert.equal(missingReceipt.rpcAvailable, true);
  assert.equal(missingReceipt.activity[0].feeSamples, 0);

  console.log('✅ Proof service test passed');
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
