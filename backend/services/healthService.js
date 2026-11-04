const mongoose = require('mongoose');
const { ethers } = require('ethers');
const redisClient = require('../config/redis');
const SyncState = require('../Models/SyncState');
const marketplaceABI = require('../abis/SALMarketplace.json');
const salABI = require('../abis/SAL1155.json');
const certificateABI = require('../abis/GreenCertificateSBT.json');
const { getBlockchainIndexerStatus } = require('./blockchainListener');

const DEFAULT_TIMEOUT_MS = 12000;
const DEFAULT_MAX_SYNC_LAG_BLOCKS = 30;

const lower = (value) => String(value || '').toLowerCase();

const withTimeout = async (promise, label, timeoutMs = DEFAULT_TIMEOUT_MS) => {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timeout sau ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};

const readAddress = (name) => {
  const value = process.env[name];
  if (!value || !ethers.isAddress(value)) {
    throw new Error(`${name} chưa được cấu hình đúng`);
  }
  return ethers.getAddress(value);
};

const getMongoHealth = () => {
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };
  const readyState = mongoose.connection.readyState;

  return {
    status: readyState === 1 ? 'up' : 'down',
    readyState,
    state: states[readyState] || 'unknown',
    database: mongoose.connection.name || null,
  };
};

const getRedisHealth = async () => {
  if (!redisClient.isOpen || !redisClient.isReady) {
    return {
      status: 'down',
      isOpen: Boolean(redisClient.isOpen),
      isReady: Boolean(redisClient.isReady),
    };
  }

  try {
    const pong = await withTimeout(redisClient.ping(), 'Redis ping', 3000);
    return {
      status: pong === 'PONG' ? 'up' : 'degraded',
      isOpen: true,
      isReady: true,
      ping: pong,
    };
  } catch (error) {
    return {
      status: 'down',
      isOpen: Boolean(redisClient.isOpen),
      isReady: Boolean(redisClient.isReady),
      error: error.message,
    };
  }
};

const getSyncStatus = async ({ chainId, targetBlock, contracts }) => {
  const maxLagBlocks = Math.max(
    0,
    Number(process.env.BLOCKCHAIN_HEALTH_MAX_LAG_BLOCKS || DEFAULT_MAX_SYNC_LAG_BLOCKS)
  );

  if (mongoose.connection.readyState !== 1) {
    return contracts.map((contract) => ({
      name: contract.name,
      address: contract.address,
      status: 'unknown',
      lastProcessedBlock: null,
      targetBlock,
      lagBlocks: null,
      maxAllowedLagBlocks: maxLagBlocks,
      error: 'MongoDB chưa kết nối nên không đọc được SyncState',
    }));
  }

  const keys = contracts.map((contract) => `${chainId}:${lower(contract.address)}`);
  const states = await SyncState.find({ key: { $in: keys } }).lean();
  const stateByKey = new Map(states.map((state) => [state.key, state]));

  return contracts.map((contract) => {
    const key = `${chainId}:${lower(contract.address)}`;
    const state = stateByKey.get(key);
    const lastProcessedBlock = state?.lastProcessedBlock ?? null;
    const lagBlocks = lastProcessedBlock == null
      ? null
      : Math.max(0, targetBlock - Number(lastProcessedBlock));

    let status = 'not_started';
    if (lastProcessedBlock != null) {
      status = lagBlocks <= maxLagBlocks ? 'synced' : 'syncing';
    }

    return {
      name: contract.name,
      address: contract.address,
      deploymentBlock: contract.deploymentBlock,
      status,
      lastProcessedBlock,
      targetBlock,
      lagBlocks,
      maxAllowedLagBlocks: maxLagBlocks,
      lastProcessedAt: state?.lastProcessedAt || null,
    };
  });
};

const getBackendMetadataSigner = () => {
  try {
    if (!process.env.METADATA_SIGNER_PRIVATE_KEY) {
      throw new Error('Thiếu METADATA_SIGNER_PRIVATE_KEY');
    }
    return {
      address: new ethers.Wallet(process.env.METADATA_SIGNER_PRIVATE_KEY).address,
      error: null,
    };
  } catch (error) {
    return { address: null, error: error.message };
  }
};

const getBlockchainHealth = async () => {
  const expectedChainId = Number(process.env.CHAIN_ID || 43113);
  const runtime = getBlockchainIndexerStatus();
  const backendSigner = getBackendMetadataSigner();

  const report = {
    rpc: {
      status: 'down',
      expectedChainId,
      actualChainId: null,
      latestBlock: null,
      confirmations: Math.max(0, Number(process.env.BLOCKCHAIN_CONFIRMATIONS || 2)),
      targetBlock: null,
    },
    contracts: [],
    wiring: { valid: false },
    metadataSigner: {
      backendAddress: backendSigner.address,
      onChainAddress: null,
      matches: false,
      ...(backendSigner.error && { error: backendSigner.error }),
    },
    indexer: {
      runtime,
      contracts: [],
    },
  };

  let addresses;
  try {
    addresses = {
      marketplace: readAddress('MARKETPLACE_CONTRACT_ADDRESS'),
      sal: readAddress('SAL_CONTRACT_ADDRESS'),
      certificate: readAddress('GREEN_CERTIFICATE_SBT_ADDRESS'),
    };
  } catch (error) {
    report.configurationError = error.message;
    return report;
  }

  const contractConfigs = [
    {
      name: 'SALMarketplace',
      address: addresses.marketplace,
      deploymentBlock: Number(process.env.MARKETPLACE_DEPLOYMENT_BLOCK || 0),
      hasCode: false,
      paused: null,
    },
    {
      name: 'SAL1155',
      address: addresses.sal,
      deploymentBlock: Number(process.env.SAL_DEPLOYMENT_BLOCK || 0),
      hasCode: false,
      paused: null,
    },
    {
      name: 'GreenCertificateSBT',
      address: addresses.certificate,
      deploymentBlock: Number(process.env.CERTIFICATE_DEPLOYMENT_BLOCK || 0),
      hasCode: false,
      paused: null,
    },
  ];
  report.contracts = contractConfigs;

  if (!process.env.RPC_URL) {
    report.rpc.error = 'Thiếu RPC_URL';
    return report;
  }

  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  let actualChainId;
  let latestBlock;
  try {
    const [network, blockNumber] = await withTimeout(
      Promise.all([provider.getNetwork(), provider.getBlockNumber()]),
      'Ethereum RPC'
    );
    actualChainId = Number(network.chainId);
    latestBlock = Number(blockNumber);
    report.rpc = {
      ...report.rpc,
      status: actualChainId === expectedChainId ? 'up' : 'wrong_network',
      actualChainId,
      latestBlock,
      targetBlock: Math.max(0, latestBlock - report.rpc.confirmations),
    };
  } catch (error) {
    report.rpc.error = error.message;
    return report;
  }

  try {
    const codes = await withTimeout(
      Promise.all(contractConfigs.map((contract) => provider.getCode(contract.address))),
      'Contract bytecode checks'
    );

    codes.forEach((code, index) => {
      contractConfigs[index].hasCode = code !== '0x';
      contractConfigs[index].status = code !== '0x' ? 'deployed' : 'missing_code';
    });
  } catch (error) {
    report.contractCheckError = error.message;
  }

  const marketplace = new ethers.Contract(addresses.marketplace, marketplaceABI.abi, provider);
  const sal = new ethers.Contract(addresses.sal, salABI.abi, provider);
  const certificate = new ethers.Contract(addresses.certificate, certificateABI.abi, provider);

  if (contractConfigs.every((contract) => contract.hasCode)) {
    try {
      const [
        marketplaceSAL,
        marketplaceCertificate,
        onChainMetadataSigner,
        marketplacePaused,
        salMarketplace,
        salMarketplaceLocked,
        salPaused,
        certificateMarketplace,
        certificateMarketplaceLocked,
        certificatePaused,
      ] = await withTimeout(
        Promise.all([
          marketplace.salToken(),
          marketplace.certificateSBT(),
          marketplace.metadataSigner(),
          marketplace.paused(),
          sal.marketplace(),
          sal.marketplaceLocked(),
          sal.paused(),
          certificate.marketplace(),
          certificate.marketplaceLocked(),
          certificate.paused(),
        ]),
        'Contract wiring checks'
      );

      contractConfigs[0].paused = Boolean(marketplacePaused);
      contractConfigs[1].paused = Boolean(salPaused);
      contractConfigs[2].paused = Boolean(certificatePaused);

      report.wiring = {
        marketplaceSAL: ethers.getAddress(marketplaceSAL),
        expectedSAL: addresses.sal,
        marketplaceCertificate: ethers.getAddress(marketplaceCertificate),
        expectedCertificate: addresses.certificate,
        salMarketplace: ethers.getAddress(salMarketplace),
        certificateMarketplace: ethers.getAddress(certificateMarketplace),
        expectedMarketplace: addresses.marketplace,
        salMarketplaceLocked: Boolean(salMarketplaceLocked),
        certificateMarketplaceLocked: Boolean(certificateMarketplaceLocked),
      };

      report.wiring.valid =
        lower(report.wiring.marketplaceSAL) === lower(report.wiring.expectedSAL) &&
        lower(report.wiring.marketplaceCertificate) === lower(report.wiring.expectedCertificate) &&
        lower(report.wiring.salMarketplace) === lower(report.wiring.expectedMarketplace) &&
        lower(report.wiring.certificateMarketplace) === lower(report.wiring.expectedMarketplace) &&
        report.wiring.salMarketplaceLocked &&
        report.wiring.certificateMarketplaceLocked;

      report.metadataSigner.onChainAddress = ethers.getAddress(onChainMetadataSigner);
      report.metadataSigner.matches =
        Boolean(report.metadataSigner.backendAddress) &&
        lower(report.metadataSigner.backendAddress) === lower(report.metadataSigner.onChainAddress);
    } catch (error) {
      report.wiring.error = error.message;
    }
  }

  try {
    report.indexer.contracts = await getSyncStatus({
      chainId: actualChainId,
      targetBlock: report.rpc.targetBlock,
      contracts: contractConfigs,
    });
  } catch (error) {
    report.indexer.error = error.message;
  }

  return report;
};

const getHealthReport = async () => {
  const checkedAt = new Date();
  const mongo = getMongoHealth();
  const redis = await getRedisHealth();
  const blockchain = await getBlockchainHealth();

  const criticalFailure =
    mongo.status !== 'up' ||
    blockchain.rpc.status !== 'up' ||
    blockchain.contracts.length !== 3 ||
    blockchain.contracts.some((contract) => !contract.hasCode) ||
    !blockchain.wiring.valid ||
    !blockchain.metadataSigner.matches;

  const degraded =
    redis.status !== 'up' ||
    blockchain.contracts.some((contract) => contract.paused === true) ||
    blockchain.indexer.contracts.length !== 3 ||
    blockchain.indexer.contracts.some((contract) => contract.status !== 'synced') ||
    Boolean(blockchain.indexer.runtime.lastSyncError);

  const status = criticalFailure ? 'unhealthy' : degraded ? 'degraded' : 'healthy';

  return {
    status,
    checkedAt,
    uptimeSeconds: Math.floor(process.uptime()),
    service: 'carbox-backend',
    metadataVersion: 'carbox-sal-certificate-v2',
    projectMetadataVersion: 'carbox-project-submission-v2',
    components: {
      mongo,
      redis,
      blockchain,
    },
  };
};

module.exports = { getHealthReport };
