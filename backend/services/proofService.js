// Numbers for the public /proof page, measured from indexed events and the chain.
const { ethers } = require('ethers');

const CATEGORY_ORDER = ['MINT', 'BUY', 'RETIRE'];
const MAX_EVENTS = 1000;
const RECENT_LIMIT = 12;
const FEE_SAMPLES_PER_CATEGORY = 5;
const BLOCK_TIME_SAMPLE = 100;

const categorize = (event) => {
  if (event.eventName === 'SALPurchased') return 'BUY';
  if (event.transactionType === 'RETIRE') return 'RETIRE';
  if (event.transactionType === 'MINT') return 'MINT';
  return null;
};

// One transaction can emit several events, so each is counted once per category.
const summarizeEvents = (events) => {
  const seen = new Set();
  const counts = Object.fromEntries(CATEGORY_ORDER.map((type) => [type, 0]));
  const transactions = [];

  for (const event of events) {
    const type = categorize(event);
    if (!type) continue;
    const key = `${type}:${event.txHash}`;
    if (seen.has(key)) continue;
    seen.add(key);
    counts[type] += 1;
    transactions.push({
      type,
      txHash: event.txHash,
      blockNumber: event.blockNumber,
      timestamp: event.timestamp,
    });
  }
  return { counts, transactions };
};

const selectForFees = (transactions) => {
  const taken = Object.fromEntries(CATEGORY_ORDER.map((type) => [type, 0]));
  return transactions.filter((tx, index) => {
    if (index < RECENT_LIMIT) {
      taken[tx.type] += 1;
      return true;
    }
    if (taken[tx.type] >= FEE_SAMPLES_PER_CATEGORY) return false;
    taken[tx.type] += 1;
    return true;
  });
};

const receiptCost = (receipt) => {
  const price = receipt?.gasPrice ?? receipt?.effectiveGasPrice;
  if (!receipt || receipt.gasUsed == null || price == null) return null;
  const gasUsed = BigInt(receipt.gasUsed);
  return {
    gasUsed: Number(gasUsed),
    feeAvax: ethers.formatEther(gasUsed * BigInt(price)),
  };
};

const averageCost = (costs) => {
  if (!costs.length) return { averageGasUsed: null, averageFeeAvax: null, feeSamples: 0 };
  const count = BigInt(costs.length);
  const totalGas = costs.reduce((sum, cost) => sum + BigInt(cost.gasUsed), 0n);
  const totalFee = costs.reduce((sum, cost) => sum + ethers.parseEther(cost.feeAvax), 0n);
  return {
    averageGasUsed: Number(totalGas / count),
    averageFeeAvax: ethers.formatEther(totalFee / count),
    feeSamples: costs.length,
  };
};

const measureBlockTime = async (provider, latestBlock, sample = BLOCK_TIME_SAMPLE) => {
  const span = Math.min(sample, latestBlock);
  if (span < 1) return null;
  const [latest, earlier] = await Promise.all([
    provider.getBlock(latestBlock),
    provider.getBlock(latestBlock - span),
  ]);
  if (!latest || !earlier) return null;
  return {
    averageSeconds: Number(((latest.timestamp - earlier.timestamp) / span).toFixed(2)),
    sampleBlocks: span,
  };
};

const attachCosts = async (provider, transactions) => {
  const selected = selectForFees(transactions);
  const costs = await Promise.all(selected.map(async (tx) => {
    try {
      return [tx.txHash, receiptCost(await provider.getTransactionReceipt(tx.txHash))];
    } catch {
      return [tx.txHash, null];
    }
  }));
  return new Map(costs);
};

// A failing RPC must not hide the counts: costs and block time simply come back empty.
const buildProofReport = async ({ loadEvents, provider, chainId }) => {
  const { counts, transactions } = summarizeEvents(await loadEvents(MAX_EVENTS));

  let latestBlock = null;
  let blockTime = null;
  let costs = new Map();
  let rpcAvailable = true;
  try {
    latestBlock = await provider.getBlockNumber();
    [blockTime, costs] = await Promise.all([
      measureBlockTime(provider, latestBlock),
      attachCosts(provider, transactions),
    ]);
  } catch {
    rpcAvailable = false;
  }

  const activity = CATEGORY_ORDER.map((type) => ({
    type,
    count: counts[type],
    ...averageCost(
      transactions
        .filter((tx) => tx.type === type)
        .map((tx) => costs.get(tx.txHash))
        .filter(Boolean)
    ),
  }));

  const recent = transactions.slice(0, RECENT_LIMIT).map((tx) => ({
    ...tx,
    gasUsed: costs.get(tx.txHash)?.gasUsed ?? null,
    feeAvax: costs.get(tx.txHash)?.feeAvax ?? null,
  }));

  return {
    generatedAt: new Date().toISOString(),
    chainId,
    latestBlock,
    rpcAvailable,
    blockTime,
    activity,
    recent,
  };
};

module.exports = { buildProofReport, summarizeEvents, categorize };
