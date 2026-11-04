const { ethers } = require('ethers');
const User = require('../Models/User');
const Project = require('../Models/Project');
const ProjectVote = require('../Models/ProjectVote');
const Listing = require('../Models/Listing');
const Transaction = require('../Models/Transaction');
const Certificate = require('../Models/Certificate');
const FeeEvent = require('../Models/FeeEvent');
const SyncState = require('../Models/SyncState');
const redisClient = require('../config/redis');
const marketplaceABI = require('../abis/SALMarketplace.json');
const salABI = require('../abis/SAL1155.json');
const certificateABI = require('../abis/GreenCertificateSBT.json');
const { extractIpfsCid, fetchJSONFromURI } = require('./ipfsService');
const { validateProjectMetadataAgainstSubmission } = require('./projectMetadataService');

const ZERO_ADDRESS =
  '0x0000000000000000000000000000000000000000';

const DEFAULT_CHAIN_ID = 43113;

let provider;
let marketplaceContract;
let salContract;
let certificateContract;
let pollingTimer;
let syncInProgress = false;
let resolvedChainId;
let indexerStartedAt = null;
let lastSyncStartedAt = null;
let lastSyncCompletedAt = null;
let lastSyncError = null;
let lastSyncErrorAt = null;
let lastTargetBlock = null;

const blockCache = new Map();

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const getRpcErrorMessage = (error) =>
  [
    error?.shortMessage,
    error?.message,
    error?.error?.message,
    error?.info?.error?.message,
    error?.cause?.message,
  ]
    .filter(Boolean)
    .join(' | ');

const isRateLimitError = (error) => {
  const codes = [
    error?.code,
    error?.error?.code,
    error?.info?.error?.code,
    error?.cause?.code,
  ];

  const message = getRpcErrorMessage(error);

  return (
    codes.some((code) => Number(code) === 429) ||
    /(?:^|\D)429(?:\D|$)|compute units|throughput|too many requests|rate limit/i.test(
      message
    )
  );
};

const getLogsWithRetry = async (filter) => {
  const maxRetries = Math.max(
    0,
    Number(process.env.BLOCKCHAIN_MAX_RETRIES || 6)
  );

  const baseDelayMs = Math.max(
    250,
    Number(
      process.env.BLOCKCHAIN_RETRY_BASE_DELAY_MS || 2000
    )
  );

  const maxDelayMs = Math.max(
    baseDelayMs,
    Number(
      process.env.BLOCKCHAIN_RETRY_MAX_DELAY_MS || 30000
    )
  );

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await getBlockchainClients().provider.getLogs(
        filter
      );
    } catch (error) {
      if (
        !isRateLimitError(error) ||
        attempt >= maxRetries
      ) {
        throw error;
      }

      const exponentialDelay = Math.min(
        baseDelayMs * (2 ** attempt),
        maxDelayMs
      );

      const jitterMs = Math.floor(Math.random() * 250);
      const delayMs = exponentialDelay + jitterMs;

      console.warn(
        `⚠️ RPC bị giới hạn tốc độ. Thử lại sau ${delayMs}ms ` +
          `(lần ${attempt + 1}/${maxRetries})`
      );

      await sleep(delayMs);
    }
  }
};

const toNumber = (value) =>
  Number(value?.toString?.() ?? value ?? 0);

const lower = (value) =>
  String(value || '').toLowerCase();

const requireAddress = (name) => {
  const value = process.env[name];

  if (!value || !ethers.isAddress(value)) {
    throw new Error(
      `${name} chưa được cấu hình đúng`
    );
  }

  return value;
};


const getMarketplaceAddress = () =>
  lower(requireAddress('MARKETPLACE_CONTRACT_ADDRESS'));

const projectScope = (projectId, chainId) => ({
  chainId: Number(chainId),
  marketplaceContractAddress: getMarketplaceAddress(),
  onChainProjectId: Number(projectId),
});

const getBlockchainClients = () => {
  if (!provider) {
    if (!process.env.RPC_URL) {
      throw new Error('Thiếu RPC_URL');
    }

    provider = new ethers.JsonRpcProvider(
      process.env.RPC_URL
    );
  }

  if (!marketplaceContract) {
    marketplaceContract = new ethers.Contract(
      requireAddress(
        'MARKETPLACE_CONTRACT_ADDRESS'
      ),
      marketplaceABI.abi,
      provider
    );
  }

  if (!salContract) {
    salContract = new ethers.Contract(
      requireAddress('SAL_CONTRACT_ADDRESS'),
      salABI.abi,
      provider
    );
  }

  if (!certificateContract) {
    certificateContract = new ethers.Contract(
      requireAddress(
        'GREEN_CERTIFICATE_SBT_ADDRESS'
      ),
      certificateABI.abi,
      provider
    );
  }

  return {
    provider,
    marketplaceContract,
    salContract,
    certificateContract,
  };
};

const getBlockDate = async (blockNumber) => {
  if (blockCache.has(blockNumber)) {
    return blockCache.get(blockNumber);
  }

  const block =
    await getBlockchainClients().provider.getBlock(
      blockNumber
    );

  const date = block?.timestamp
    ? new Date(Number(block.timestamp) * 1000)
    : new Date();

  blockCache.set(blockNumber, date);

  if (blockCache.size > 500) {
    blockCache.delete(
      blockCache.keys().next().value
    );
  }

  return date;
};

const getChainId = async () => {
  if (resolvedChainId) {
    return resolvedChainId;
  }

  const network =
    await getBlockchainClients().provider.getNetwork();

  resolvedChainId = Number(network.chainId);

  const configuredChainId = Number(
    process.env.CHAIN_ID || resolvedChainId
  );

  if (configuredChainId !== resolvedChainId) {
    throw new Error(
      `CHAIN_ID (${configuredChainId}) không khớp RPC network (${resolvedChainId})`
    );
  }

  return resolvedChainId;
};

// Dữ liệu on-chain vẫn phải được lưu kể cả khi IPFS gateway tạm thời lỗi.
const safeFetchJSONFromURI = async (
  uri,
  label
) => {
  try {
    return await fetchJSONFromURI(uri);
  } catch (error) {
    console.warn(
      `⚠️ Chưa tải được metadata ${
        label || uri
      }: ${error.message}`
    );

    return null;
  }
};

const invalidateHistoryCache = async (
  ...addresses
) => {
  if (!redisClient.isReady) {
    return;
  }

  const keys = addresses
    .filter(Boolean)
    .map(
      (address) =>
        `tx_history_${lower(address)}`
    );

  if (keys.length) {
    await redisClient.del(keys).catch(() => {});
  }
};

const upsertTransaction = async (
  ctx,
  data
) => {
  const { eventKeySuffix, ...transactionData } = data;
  const eventKey =
    `${ctx.chainId}:` +
    `${ctx.contractAddress}:` +
    `${ctx.txHash}:` +
    `${ctx.logIndex}` +
    (eventKeySuffix ? `:${eventKeySuffix}` : '');

  const payload = {
    eventKey,
    chainId: ctx.chainId,
    contractAddress: ctx.contractAddress,
    eventName: ctx.eventName,
    txHash: ctx.txHash,
    blockNumber: ctx.blockNumber,
    blockHash: ctx.blockHash,
    logIndex: ctx.logIndex,
    timestamp: ctx.timestamp,
    ...transactionData,
  };

  const transaction =
    await Transaction.findOneAndUpdate(
      { eventKey },
      { $set: payload },
      {
        upsert: true,
        returnDocument: 'after',
        setDefaultsOnInsert: true,
      }
    );

  await invalidateHistoryCache(
    payload.fromAddress,
    payload.toAddress
  );

  return transaction;
};

const upsertFeeEvent = async (ctx, data) => {
  const eventKey =
    `${ctx.chainId}:` +
    `${ctx.contractAddress}:` +
    `${ctx.txHash}:` +
    `${ctx.logIndex}`;

  return FeeEvent.findOneAndUpdate(
    { eventKey },
    {
      $set: {
        eventKey,
        chainId: ctx.chainId,
        contractAddress:
          ctx.contractAddress,
        eventName: ctx.eventName,
        txHash: ctx.txHash,
        blockNumber: ctx.blockNumber,
        blockHash: ctx.blockHash,
        logIndex: ctx.logIndex,
        timestamp: ctx.timestamp,
        ...data,
      },
    },
    {
      upsert: true,
      returnDocument: 'after',
      setDefaultsOnInsert: true,
    }
  );
};

const recalculateProjectSoldTokens = async (
  projectId,
  chainId
) => {
  const result = await Transaction.aggregate([
    {
      $match: {
        chainId: Number(chainId),
        eventName: 'SALPurchased',
        transactionType: 'TRANSFER',
        projectId: Number(projectId),
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$amount' },
      },
    },
  ]);

  await Project.findOneAndUpdate(
    projectScope(projectId, chainId),
    { soldTokens: result[0]?.total || 0 }
  );
};

const recalculateProjectListingSummary = async (
  projectId,
  chainId
) => {
  const filter = {
    chainId: Number(chainId),
    marketplaceContractAddress: getMarketplaceAddress(),
    projectId: Number(projectId),
    active: true,
  };

  const [summary, latest] = await Promise.all([
    Listing.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          listedTokens: { $sum: '$remainingAmount' },
        },
      },
    ]),
    Listing.findOne(filter).sort({ listingId: -1 }),
  ]);

  await Project.findOneAndUpdate(
    projectScope(projectId, chainId),
    {
      listedTokens: summary[0]?.listedTokens || 0,
      activeListingId: latest?.listingId ?? null,
      pricePerCredit: latest?.pricePerUnitETH ?? null,
    }
  );
};

const recalculateProjectVoteSummary = async (
  projectId,
  chainId
) => {
  const counts = await ProjectVote.aggregate([
    {
      $match: {
        chainId: Number(chainId),
        marketplaceContractAddress: getMarketplaceAddress(),
        projectId: Number(projectId),
      },
    },
    {
      $group: {
        _id: '$approved',
        total: { $sum: 1 },
      },
    },
  ]);

  const approvalVotes = counts.find((item) => item._id === true)?.total || 0;
  const rejectionVotes = counts.find((item) => item._id === false)?.total || 0;

  await Project.findOneAndUpdate(
    projectScope(projectId, chainId),
    { approvalVotes, rejectionVotes }
  );
};

const recalculateUserRetiredTokens = async (
  ownerAddress
) => {
  const result = await Certificate.aggregate([
    {
      $match: {
        ownerAddress: lower(ownerAddress),
        status: 'ACTIVE',
      },
    },
    {
      $group: {
        _id: null,
        total: {
          $sum: '$retiredTokenAmount',
        },
      },
    },
  ]);

  await User.findOneAndUpdate(
    {
      parentWalletAddress:
        lower(ownerAddress),
    },
    {
      totalRetired:
        result[0]?.total || 0,
    }
  );
};

const buildEventContext = async (
  log,
  parsed
) => ({
  args: parsed.args,
  eventName: parsed.name,
  chainId: await getChainId(),
  contractAddress: lower(log.address),
  txHash: lower(log.transactionHash),
  blockNumber: Number(log.blockNumber),
  blockHash: log.blockHash,
  logIndex: Number(
    log.index ?? log.logIndex ?? 0
  ),
  timestamp: await getBlockDate(
    Number(log.blockNumber)
  ),
});

const handleProjectSubmitted = async (ctx) => {
  const [projectIdRaw, ownerRaw, projectURI, proposedCO2KgRaw] = ctx.args;

  const projectId = toNumber(projectIdRaw);
  const owner = lower(ownerRaw);
  const proposedCO2Kg = toNumber(proposedCO2KgRaw);
  const metadata = await safeFetchJSONFromURI(projectURI, `dự án ${projectId}`);
  const cid = extractIpfsCid(projectURI);
  const validation = validateProjectMetadataAgainstSubmission(metadata, {
    ownerWallet: owner,
    proposedCO2Kg,
  });
  const scope = projectScope(projectId, ctx.chainId);

  const existing = await Project.findOne({
    $or: [
      scope,
      {
        ownerWallet: owner,
        ipfsHash: { $in: [projectURI, cid].filter(Boolean) },
        status: 'Pending',
        onChainProjectId: { $in: [null, projectId] },
      },
    ],
  });

  const update = {
    ...scope,
    ownerWallet: owner,
    ipfsHash: cid || projectURI,
    projectURI,
    projectMetadata: metadata,
    metadataValidationStatus: validation.status,
    metadataValidationErrors: validation.errors,
    metadataValidatedAt: new Date(),
    projectName:
      metadata?.name ||
      metadata?.projectName ||
      existing?.projectName ||
      `Dự án #${projectId}`,
    proposedCO2Kg,
    totalCarbon: proposedCO2Kg,
    status: 'Pending',
    blacklisted: false,
    cancelled: false,
  };

  if (existing) {
    await Project.findByIdAndUpdate(existing._id, update);
  } else {
    await Project.create(update);
  }
};

const handleProjectValidatorSnapshot = async (ctx) => {
  const [projectIdRaw, eligibleRaw, quorumRaw] = ctx.args;

  await Project.findOneAndUpdate(
    projectScope(toNumber(projectIdRaw), ctx.chainId),
    {
      eligibleValidatorCount: toNumber(eligibleRaw),
      approvalQuorum: toNumber(quorumRaw),
    }
  );
};

const handleProjectApprovalVoted = async (ctx) => {
  const [projectIdRaw, validatorRaw, approvedRaw] = ctx.args;
  const projectId = toNumber(projectIdRaw);
  const validatorAddress = lower(validatorRaw);

  await ProjectVote.findOneAndUpdate(
    {
      chainId: ctx.chainId,
      marketplaceContractAddress: getMarketplaceAddress(),
      projectId,
      validatorAddress,
    },
    {
      $set: {
        chainId: ctx.chainId,
        marketplaceContractAddress: getMarketplaceAddress(),
        projectId,
        validatorAddress,
        approved: Boolean(approvedRaw),
        txHash: ctx.txHash,
        blockNumber: ctx.blockNumber,
        blockHash: ctx.blockHash,
        logIndex: ctx.logIndex,
        votedAt: ctx.timestamp,
      },
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );

  await recalculateProjectVoteSummary(projectId, ctx.chainId);
};

const handleProjectApproved = async (ctx) => {
  const [
    projectIdRaw,
    approvedByRaw,
    approvedCO2KgRaw,
    salAmountRaw,
  ] = ctx.args;

  const projectId =
    toNumber(projectIdRaw);

  let tokenURI = null;
  let tokenMetadata = null;

  try {
    tokenURI =
      await getBlockchainClients()
        .salContract.uri(projectId);

    tokenMetadata =
      await safeFetchJSONFromURI(
        tokenURI,
        `SAL project #${projectId}`
      );
  } catch (error) {
    console.warn(
      `⚠️ Không đọc được SAL metadata project #${projectId}: ${error.message}`
    );
  }

  await Project.findOneAndUpdate(
    projectScope(projectId, ctx.chainId),
    {
      status: 'Approved',
      approvedCO2Kg:
        toNumber(approvedCO2KgRaw),
      totalCarbon:
        toNumber(approvedCO2KgRaw),
      mintedTokenAmount:
        toNumber(salAmountRaw),
      tokenURI,
      tokenMetadata,
      metadata: {
        approvedBy:
          lower(approvedByRaw),
      },
    }
  );
};

const handlePendingProjectCancelled =
  async (ctx) => {
    const [
      projectIdRaw,
      ownerRaw,
      refundRaw,
    ] = ctx.args;

    const projectId =
      toNumber(projectIdRaw);

    await Project.findOneAndUpdate(
      projectScope(projectId, ctx.chainId),
      {
        status: 'Cancelled',
        cancelled: true,
        tokenizationRefundWei:
          refundRaw.toString(),
      }
    );
  };

const handleProjectBlacklisted =
  async (ctx) => {
    const [
      projectIdRaw,
      reason,
    ] = ctx.args;

    await Project.findOneAndUpdate(
      projectScope(toNumber(projectIdRaw), ctx.chainId),
      {
        blacklisted: true,
        blacklistReason: reason,
        listedTokens: 0,
        activeListingId: null,
      }
    );
  };

const handleProjectUnblacklisted =
  async (ctx) => {
    const [projectIdRaw] = ctx.args;

    await Project.findOneAndUpdate(
      projectScope(toNumber(projectIdRaw), ctx.chainId),
      {
        blacklisted: false,
        blacklistReason: null,
      }
    );
  };

const handleOwnerBlacklisted =
  async (ctx) => {
    const [
      accountRaw,
      reason,
    ] = ctx.args;

    await User.findOneAndUpdate(
      {
        parentWalletAddress:
          lower(accountRaw),
      },
      {
        blacklisted: true,
        blacklistReason: reason,
      }
    );
  };

const handleOwnerUnblacklisted =
  async (ctx) => {
    const [accountRaw] = ctx.args;

    await User.findOneAndUpdate(
      {
        parentWalletAddress:
          lower(accountRaw),
      },
      {
        blacklisted: false,
        blacklistReason: null,
      }
    );
  };
const handleListingCreated = async (ctx) => {
  const [listingIdRaw, projectIdRaw, sellerRaw, amountRaw, pricePerUnitRaw] = ctx.args;
  const listingId = toNumber(listingIdRaw);
  const projectId = toNumber(projectIdRaw);
  const amount = toNumber(amountRaw);

  await Listing.findOneAndUpdate(
    {
      chainId: ctx.chainId,
      marketplaceContractAddress: getMarketplaceAddress(),
      listingId,
    },
    {
      $set: {
        chainId: ctx.chainId,
        marketplaceContractAddress: getMarketplaceAddress(),
        listingId,
        projectId,
        sellerAddress: lower(sellerRaw),
        initialAmount: amount,
        remainingAmount: amount,
        pricePerUnitWei: pricePerUnitRaw.toString(),
        pricePerUnitETH: ethers.formatEther(pricePerUnitRaw),
        active: true,
        createdTxHash: ctx.txHash,
        createdBlockNumber: ctx.blockNumber,
        createdOnChainAt: ctx.timestamp,
        updatedTxHash: ctx.txHash,
        updatedBlockNumber: ctx.blockNumber,
        closedAt: null,
      },
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );

  await recalculateProjectListingSummary(projectId, ctx.chainId);
};

const handleListingCancelled = async (ctx) => {
  const [listingIdRaw] = ctx.args;
  const listingId = toNumber(listingIdRaw);
  const onChainListing = await getBlockchainClients().marketplaceContract.listings(listingId);
  const projectId = toNumber(onChainListing.projectId);

  await Listing.findOneAndUpdate(
    {
      chainId: ctx.chainId,
      marketplaceContractAddress: getMarketplaceAddress(),
      listingId,
    },
    {
      $set: {
        projectId,
        sellerAddress: lower(onChainListing.seller),
        remainingAmount: toNumber(onChainListing.amount),
        pricePerUnitWei: onChainListing.pricePerUnit.toString(),
        pricePerUnitETH: ethers.formatEther(onChainListing.pricePerUnit),
        active: false,
        updatedTxHash: ctx.txHash,
        updatedBlockNumber: ctx.blockNumber,
        closedAt: ctx.timestamp,
      },
      $setOnInsert: {
        chainId: ctx.chainId,
        marketplaceContractAddress: getMarketplaceAddress(),
        listingId,
        initialAmount: toNumber(onChainListing.amount),
        createdTxHash: ctx.txHash,
        createdBlockNumber: ctx.blockNumber,
        createdOnChainAt: ctx.timestamp,
      },
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );

  await recalculateProjectListingSummary(projectId, ctx.chainId);
};

const handleSALPurchased = async (ctx) => {
  const [listingIdRaw, buyerRaw, amountRaw, totalPriceRaw, feeRaw] = ctx.args;
  const listingId = toNumber(listingIdRaw);
  const onChainListing = await getBlockchainClients().marketplaceContract.listings(listingId);
  const projectId = toNumber(onChainListing.projectId);
  const buyer = lower(buyerRaw);
  const seller = lower(onChainListing.seller);

  await Listing.findOneAndUpdate(
    {
      chainId: ctx.chainId,
      marketplaceContractAddress: getMarketplaceAddress(),
      listingId,
    },
    {
      $set: {
        projectId,
        sellerAddress: seller,
        remainingAmount: toNumber(onChainListing.amount),
        pricePerUnitWei: onChainListing.pricePerUnit.toString(),
        pricePerUnitETH: ethers.formatEther(onChainListing.pricePerUnit),
        active: Boolean(onChainListing.active),
        updatedTxHash: ctx.txHash,
        updatedBlockNumber: ctx.blockNumber,
        closedAt: onChainListing.active ? null : ctx.timestamp,
      },
      $setOnInsert: {
        chainId: ctx.chainId,
        marketplaceContractAddress: getMarketplaceAddress(),
        listingId,
        initialAmount: toNumber(amountRaw) + toNumber(onChainListing.amount),
        createdTxHash: ctx.txHash,
        createdBlockNumber: ctx.blockNumber,
        createdOnChainAt: ctx.timestamp,
      },
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );

  await upsertTransaction(ctx, {
    fromAddress: seller,
    toAddress: buyer,
    amount: toNumber(amountRaw),
    transactionType: 'TRANSFER',
    projectId,
    listingId,
    totalPriceWei: totalPriceRaw.toString(),
    feeWei: feeRaw.toString(),
    metadata: { transferKind: 'MARKETPLACE_PURCHASE' },
  });

  await Promise.all([
    recalculateProjectSoldTokens(projectId, ctx.chainId),
    recalculateProjectListingSummary(projectId, ctx.chainId),
  ]);
};

const upsertCertificateFromChain =
  async ({
    ctx,
    tokenId,
    owner,
    projectIds,
    salAmounts,
    totalSALAmount,
    totalCO2Kg,
    certificateURI,
    mintedAt,
  }) => {
    const normalizedProjectIds = Array.from(projectIds || []).map(toNumber);
    const normalizedSALAmounts = Array.from(salAmounts || []).map(toNumber);

    if (
      normalizedProjectIds.length === 0 ||
      normalizedProjectIds.length !== normalizedSALAmounts.length
    ) {
      throw new Error(`Composition của chứng chỉ #${tokenId} không hợp lệ`);
    }

    const projects = await Project.find({
      chainId: Number(ctx.chainId),
      marketplaceContractAddress: getMarketplaceAddress(),
      onChainProjectId: { $in: normalizedProjectIds },
    });

    const projectMap = new Map(
      projects.map((project) => [Number(project.onChainProjectId), project])
    );

    const calculatedTotalSAL = normalizedSALAmounts.reduce((sum, amount) => sum + amount, 0);
    const retiredTokenAmount = toNumber(totalSALAmount) || calculatedTotalSAL;
    const retiredCO2Kg = toNumber(totalCO2Kg) || (retiredTokenAmount * 10);
    const calculatedKgPerSAL = retiredTokenAmount > 0
      ? retiredCO2Kg / retiredTokenAmount
      : 10;
    const kgPerSAL = Number.isFinite(calculatedKgPerSAL) && calculatedKgPerSAL > 0
      ? calculatedKgPerSAL
      : 10;

    const sources = normalizedProjectIds.map((projectId, index) => ({
      projectId,
      projectName: projectMap.get(projectId)?.projectName || `Dự án #${projectId}`,
      retiredTokenAmount: normalizedSALAmounts[index],
      retiredCO2Kg: normalizedSALAmounts[index] * kgPerSAL,
    }));
    const legacyProjectId = sources.length === 1 ? sources[0].projectId : 0;
    const legacyProjectName = sources.length === 1
      ? sources[0].projectName
      : `${sources.length} source projects`;
    const retirementBasketKey = sources
      .map((source) => `${source.projectId}:${source.retiredTokenAmount}`)
      .join('|');

    const metadata =
      await safeFetchJSONFromURI(
        certificateURI,
        `chứng chỉ #${tokenId}`
      );

    const contractAddress = lower(
      process.env.GREEN_CERTIFICATE_SBT_ADDRESS
    );

    const update = {
      chainId: ctx.chainId,
      certificateContractAddress: contractAddress,
      certificateTokenId: tokenId,
      ownerAddress: owner,
      projectId: legacyProjectId,
      projectName: legacyProjectName,
      projectCount: sources.length,
      sources,
      retirementBasketKey,
      retiredTokenAmount,
      retiredCO2Kg,
      certificateURI,
      metadataCID: extractIpfsCid(certificateURI),
      imageURI: metadata?.image || null,
      metadata,
      txHash: ctx.txHash,
      blockNumber: ctx.blockNumber,
      blockHash: ctx.blockHash,
      logIndex: ctx.logIndex,
      mintedAt: mintedAt || ctx.timestamp,
      status: 'ACTIVE',
      consumedAt: new Date(),
      expiredAt: null,
      revokedReason: null,
      lastSyncedAt: new Date(),
    };

    let certificate = await Certificate.findOne({
      chainId: ctx.chainId,
      certificateContractAddress: contractAddress,
      certificateTokenId: tokenId,
    });

    if (!certificate) {
      // URI được backend tạo riêng cho từng draft nên là khóa match an toàn
      // để chuyển PENDING draft thành ACTIVE certificate.
      certificate = await Certificate.findOne({
        certificateURI,
        ownerAddress: owner,
        status: 'PENDING',
      }).sort({ createdAt: -1 });
    }

    if (certificate) {
      certificate = await Certificate.findByIdAndUpdate(
        certificate._id,
        { $set: update },
        { returnDocument: 'after' }
      );
    } else {
      certificate = await Certificate.create(update);
    }

    // Gắn URI/CID vào các dòng RETIRE theo từng nguồn của cùng transaction.
    // Không tạo thêm transaction tổng để tránh double-count trong lịch sử.
    await Transaction.updateMany(
      {
        chainId: Number(ctx.chainId),
        txHash: lower(ctx.txHash),
        transactionType: 'RETIRE',
        certificateTokenId: Number(tokenId),
      },
      {
        $set: {
          certificateURI,
          ipfsHash: extractIpfsCid(certificateURI),
        },
      }
    );

    await recalculateUserRetiredTokens(owner);
    return certificate;
  };

const readCertificateComposition = async (tokenId, fallbackProjectId, fallbackSALAmount) => {
  const certContract = getBlockchainClients().certificateContract;

  try {
    const [projectIdsRaw, salAmountsRaw] =
      await certContract.getCertificateComposition(tokenId);

    const projectIds = Array.from(projectIdsRaw || []).map(toNumber);
    const salAmounts = Array.from(salAmountsRaw || []).map(toNumber);

    if (projectIds.length > 0 && projectIds.length === salAmounts.length) {
      return { projectIds, salAmounts };
    }
  } catch (error) {
    console.warn(
      `⚠️ Chưa đọc được composition của SBT #${tokenId}: ${error.message}`
    );
  }

  // Fallback chỉ dành cho certificate 1 project / dữ liệu cũ.
  if (toNumber(fallbackProjectId) > 0 && toNumber(fallbackSALAmount) > 0) {
    return {
      projectIds: [toNumber(fallbackProjectId)],
      salAmounts: [toNumber(fallbackSALAmount)],
    };
  }

  throw new Error(`Không thể xác định composition của chứng chỉ #${tokenId}`);
};

// Event per-project vẫn được giữ để lịch sử giao dịch/audit trail có 1 dòng
// RETIRE cho từng nguồn. Certificate record KHÔNG được tạo ở đây vì 1 basket
// nhiều project chỉ mint đúng 1 SBT.
const handleSALRetired = async (ctx) => {
  const [
    ownerRaw,
    projectIdRaw,
    salAmountRaw,
    co2KgRaw,
    tokenIdRaw,
  ] = ctx.args;

  const owner = lower(ownerRaw);
  const projectId = toNumber(projectIdRaw);
  const salAmount = toNumber(salAmountRaw);
  const co2Kg = toNumber(co2KgRaw);
  const tokenId = toNumber(tokenIdRaw);

  await upsertTransaction(ctx, {
    fromAddress: owner,
    toAddress: ZERO_ADDRESS,
    amount: salAmount,
    transactionType: 'RETIRE',
    projectId,
    co2Kg,
    certificateTokenId: tokenId,
    metadata: {
      retirementKind: 'MULTI_PROJECT_SOURCE',
    },
  });

  return null;
};

// Canonical marketplace event cho 1 retirement basket (1-5 project => 1 SBT).
const handleMultiProjectSALRetired = async (ctx) => {
  const [
    ownerRaw,
    tokenIdRaw,
    projectIdsRaw,
    salAmountsRaw,
    totalSALAmountRaw,
    totalCO2KgRaw,
  ] = ctx.args;

  const owner = lower(ownerRaw);
  const tokenId = toNumber(tokenIdRaw);
  const projectIds = Array.from(projectIdsRaw || []).map(toNumber);
  const salAmounts = Array.from(salAmountsRaw || []).map(toNumber);
  const totalSALAmount = toNumber(totalSALAmountRaw);
  const totalCO2Kg = toNumber(totalCO2KgRaw);

  const certContract = getBlockchainClients().certificateContract;
  const info = await certContract.certificates(tokenId);
  const certificateURI = info.certificateURI;

  if (!certificateURI) {
    throw new Error(`SBT #${tokenId} không có certificateURI`);
  }

  const mintedAt = info.retiredAt
    ? new Date(toNumber(info.retiredAt) * 1000)
    : ctx.timestamp;

  return upsertCertificateFromChain({
    ctx,
    tokenId,
    owner,
    projectIds,
    salAmounts,
    totalSALAmount,
    totalCO2Kg,
    certificateURI,
    mintedAt,
  });
};

const handleSALMinted = async (ctx) => {
  const [
    toRaw,
    projectIdRaw,
    amountRaw,
    tokenURI,
  ] = ctx.args;

  const projectId =
    toNumber(projectIdRaw);

  const amount =
    toNumber(amountRaw);

  await Project.findOneAndUpdate(
    projectScope(projectId, ctx.chainId),
    {
      mintedTokenAmount: amount,
      tokenURI,
    }
  );

  await upsertTransaction(ctx, {
    fromAddress: ZERO_ADDRESS,
    toAddress: lower(toRaw),
    amount,
    transactionType: 'MINT',
    projectId,
    metadata: {
      tokenURI,
    },
  });
};

const handleSALBurned = async (ctx) => {
  const [
    fromRaw,
    projectIdRaw,
    amountRaw,
  ] = ctx.args;

  await upsertTransaction(ctx, {
    fromAddress: lower(fromRaw),
    toAddress: ZERO_ADDRESS,
    amount: toNumber(amountRaw),
    transactionType: 'BURN',
    projectId:
      toNumber(projectIdRaw),
    metadata: {
      technicalEvent: true,
      reason:
        'SAL retirement burn',
    },
  });
};


const isDirectWalletTransfer = (from, to) => {
  const marketplace = getMarketplaceAddress();
  return (
    from !== ZERO_ADDRESS &&
    to !== ZERO_ADDRESS &&
    from !== marketplace &&
    to !== marketplace
  );
};

const handleTransferSingle = async (ctx) => {
  const [, fromRaw, toRaw, projectIdRaw, amountRaw] = ctx.args;
  const fromAddress = lower(fromRaw);
  const toAddress = lower(toRaw);

  if (!isDirectWalletTransfer(fromAddress, toAddress)) return;

  await upsertTransaction(ctx, {
    fromAddress,
    toAddress,
    amount: toNumber(amountRaw),
    transactionType: 'TRANSFER',
    projectId: toNumber(projectIdRaw),
    metadata: { transferKind: 'DIRECT_ERC1155_TRANSFER' },
  });
};

const handleTransferBatch = async (ctx) => {
  const [, fromRaw, toRaw, idsRaw, valuesRaw] = ctx.args;
  const fromAddress = lower(fromRaw);
  const toAddress = lower(toRaw);

  if (!isDirectWalletTransfer(fromAddress, toAddress)) return;

  const ids = Array.from(idsRaw || []);
  const values = Array.from(valuesRaw || []);

  for (let index = 0; index < ids.length; index += 1) {
    await upsertTransaction(ctx, {
      eventKeySuffix: `batch-${index}`,
      fromAddress,
      toAddress,
      amount: toNumber(values[index]),
      transactionType: 'TRANSFER',
      projectId: toNumber(ids[index]),
      metadata: {
        transferKind: 'DIRECT_ERC1155_BATCH_TRANSFER',
        batchIndex: index,
      },
    });
  }
};

const handleCertificateMinted =
  async (ctx) => {
    const [
      tokenIdRaw,
      ownerRaw,
      legacyProjectIdRaw,
      totalSALAmountRaw,
      totalCO2KgRaw,
      certificateURI,
    ] = ctx.args;

    const tokenId = toNumber(tokenIdRaw);
    const totalSALAmount = toNumber(totalSALAmountRaw);
    const composition = await readCertificateComposition(
      tokenId,
      legacyProjectIdRaw,
      totalSALAmountRaw
    );

    let certInfo = null;
    try {
      certInfo = await getBlockchainClients()
        .certificateContract
        .certificates(tokenId);
    } catch (err) {
      console.warn(
        `⚠️ Không đọc được certificates(${tokenId}): ${err.message}`
      );
    }

    const mintedAt = certInfo?.retiredAt
      ? new Date(toNumber(certInfo.retiredAt) * 1000)
      : ctx.timestamp;

    return upsertCertificateFromChain({
      ctx,
      tokenId,
      owner: lower(ownerRaw),
      projectIds: composition.projectIds,
      salAmounts: composition.salAmounts,
      totalSALAmount,
      totalCO2Kg: toNumber(totalCO2KgRaw),
      certificateURI,
      mintedAt,
    });
  };

const handleCertificateRevoked =
  async (ctx) => {
    const [
      tokenIdRaw,
      reason,
    ] = ctx.args;

    const tokenId =
      toNumber(tokenIdRaw);

    const certificate =
      await Certificate.findOneAndUpdate(
        {
          chainId: ctx.chainId,
          certificateContractAddress:
            lower(
              process.env
                .GREEN_CERTIFICATE_SBT_ADDRESS
            ),
          certificateTokenId: tokenId,
        },
        {
          status: 'REVOKED',
          revokedReason: reason,
          lastSyncedAt: new Date(),
        },
        {
          returnDocument: 'after',
        }
      );

    if (certificate?.ownerAddress) {
      await recalculateUserRetiredTokens(
        certificate.ownerAddress
      );
    }
  };

const handleTokenizationDeposit =
  async (ctx) => {
    const [
      projectIdRaw,
      ownerRaw,
      maximumSALRaw,
      feePerSALRaw,
      amountRaw,
    ] = ctx.args;

    const projectId =
      toNumber(projectIdRaw);

    await Project.findOneAndUpdate(
      projectScope(projectId, ctx.chainId),
      {
        tokenizationDepositWei:
          amountRaw.toString(),
      }
    );

    await upsertFeeEvent(ctx, {
      projectId,
      ownerAddress:
        lower(ownerRaw),
      maximumSALAmount:
        toNumber(maximumSALRaw),
      feePerSALWei:
        feePerSALRaw.toString(),
      amountWei:
        amountRaw.toString(),
    });
  };

const handleTokenizationFeeCollected =
  async (ctx) => {
    const [
      projectIdRaw,
      ownerRaw,
      salAmountRaw,
      amountRaw,
    ] = ctx.args;

    const projectId =
      toNumber(projectIdRaw);

    await Project.findOneAndUpdate(
      projectScope(projectId, ctx.chainId),
      {
        tokenizationFeeChargedWei:
          amountRaw.toString(),
      }
    );

    await upsertFeeEvent(ctx, {
      projectId,
      ownerAddress:
        lower(ownerRaw),
      salAmount:
        toNumber(salAmountRaw),
      amountWei:
        amountRaw.toString(),
    });
  };

const handleTokenizationRefundCredited =
  async (ctx) => {
    const [
      projectIdRaw,
      ownerRaw,
      amountRaw,
    ] = ctx.args;

    const projectId =
      toNumber(projectIdRaw);

    await Project.findOneAndUpdate(
      projectScope(projectId, ctx.chainId),
      {
        tokenizationRefundWei:
          amountRaw.toString(),
      }
    );

    await upsertFeeEvent(ctx, {
      projectId,
      ownerAddress:
        lower(ownerRaw),
      amountWei:
        amountRaw.toString(),
    });
  };

const handleTokenizationRefundWithdrawn =
  async (ctx) => {
    const [
      ownerRaw,
      amountRaw,
    ] = ctx.args;

    await upsertFeeEvent(ctx, {
      ownerAddress:
        lower(ownerRaw),
      amountWei:
        amountRaw.toString(),
    });
  };

const handleCertificateMintFeeCollected =
  async (ctx) => {
    const [
      ownerRaw,
      projectIdRaw,
      tokenIdRaw,
      amountRaw,
    ] = ctx.args;

    await upsertFeeEvent(ctx, {
      projectId:
        toNumber(projectIdRaw),
      ownerAddress:
        lower(ownerRaw),
      certificateTokenId:
        toNumber(tokenIdRaw),
      amountWei:
        amountRaw.toString(),
    });
  };

const handleTreasuryClaimed =
  async (ctx) => {
    const [
      toRaw,
      amountRaw,
    ] = ctx.args;

    await upsertFeeEvent(ctx, {
      ownerAddress: lower(toRaw),
      amountWei:
        amountRaw.toString(),
    });
  };
  const marketplaceHandlers = {
  ProjectSubmitted:
    handleProjectSubmitted,

  ProjectValidatorSnapshot:
    handleProjectValidatorSnapshot,

  ProjectApprovalVoted:
    handleProjectApprovalVoted,

  ProjectApproved:
    handleProjectApproved,

  PendingProjectCancelled:
    handlePendingProjectCancelled,

  ProjectBlacklisted:
    handleProjectBlacklisted,

  ProjectUnblacklisted:
    handleProjectUnblacklisted,

  OwnerBlacklisted:
    handleOwnerBlacklisted,

  OwnerUnblacklisted:
    handleOwnerUnblacklisted,

  ListingCreated:
    handleListingCreated,

  ListingCancelled:
    handleListingCancelled,

  SALPurchased:
    handleSALPurchased,

  SALRetired:
    handleSALRetired,

  MultiProjectSALRetired:
    handleMultiProjectSALRetired,

  TokenizationDepositReceived:
    handleTokenizationDeposit,

  TokenizationFeeCollected:
    handleTokenizationFeeCollected,

  TokenizationFeeRefundCredited:
    handleTokenizationRefundCredited,

  TokenizationFeeRefundWithdrawn:
    handleTokenizationRefundWithdrawn,

  CertificateMintFeeCollected:
    handleCertificateMintFeeCollected,

  TreasuryClaimed:
    handleTreasuryClaimed,
};

const salHandlers = {
  SALMinted:
    handleSALMinted,

  SALBurned:
    handleSALBurned,

  ProjectBlacklisted:
    handleProjectBlacklisted,

  ProjectUnblacklisted:
    handleProjectUnblacklisted,

  TransferSingle:
    handleTransferSingle,

  TransferBatch:
    handleTransferBatch,
};

const certificateHandlers = {
  CertificateMinted:
    handleCertificateMinted,

  CertificateRevoked:
    handleCertificateRevoked,
};

const processLog = async (
  log,
  contractInterface,
  handlers
) => {
  let parsed;

  try {
    parsed =
      contractInterface.parseLog(log);
  } catch (_) {
    return null;
  }

  const handler =
    handlers[parsed?.name];

  if (!handler) {
    return null;
  }

  const context =
    await buildEventContext(
      log,
      parsed
    );

  return handler(context);
};

const syncContractRange = async ({
  contractName,
  contract,
  handlers,
  deploymentBlock,
  targetBlock,
}) => {
  const chainId = await getChainId();

  const contractAddress = lower(
    await contract.getAddress()
  );

  const stateKey =
    `${chainId}:${contractAddress}`;

  const state =
    await SyncState.findOne({
      key: stateKey,
    });

  let fromBlock = state
    ? state.lastProcessedBlock + 1
    : deploymentBlock;

  if (fromBlock > targetBlock) {
    return;
  }

  const chunkSize = Math.max(
    1,
    Number(
      process.env
        .BLOCKCHAIN_SYNC_CHUNK_SIZE || 10
    )
  );

  const chunkDelayMs = Math.max(
    0,
    Number(
      process.env
        .BLOCKCHAIN_SYNC_DELAY_MS || 1000
    )
  );

  while (fromBlock <= targetBlock) {
    const toBlock = Math.min(
      fromBlock + chunkSize - 1,
      targetBlock
    );

    const logs =
      await getLogsWithRetry({
        address: contractAddress,
        fromBlock,
        toBlock,
      });

    logs.sort(
      (a, b) =>
        a.blockNumber -
          b.blockNumber ||
        (a.index ?? 0) -
          (b.index ?? 0)
    );

    for (const log of logs) {
      await processLog(
        log,
        contract.interface,
        handlers
      );
    }

    await SyncState.findOneAndUpdate(
      {
        key: stateKey,
      },
      {
        contractName,
        contractAddress,
        chainId,
        lastProcessedBlock:
          toBlock,
        lastProcessedAt:
          new Date(),
      },
      {
        upsert: true,
        setDefaultsOnInsert: true,
      }
    );

    fromBlock = toBlock + 1;

    if (
      fromBlock <= targetBlock &&
      chunkDelayMs > 0
    ) {
      await sleep(chunkDelayMs);
    }
  }
};

const syncBlockchainEvents = async () => {
  if (syncInProgress) {
    return;
  }

  syncInProgress = true;
  lastSyncStartedAt = new Date();
  let completedSuccessfully = false;

  try {
    const clients =
      getBlockchainClients();

    const latest =
      await clients.provider
        .getBlockNumber();

    const confirmations = Number(
      process.env
        .BLOCKCHAIN_CONFIRMATIONS || 2
    );

    const targetBlock =
      latest - confirmations;

    lastTargetBlock = targetBlock;

    if (targetBlock < 0) {
      completedSuccessfully = true;
      return;
    }

    await syncContractRange({
      contractName:
        'SALMarketplace',

      contract:
        clients.marketplaceContract,

      handlers:
        marketplaceHandlers,

      deploymentBlock: Number(
        process.env
          .MARKETPLACE_DEPLOYMENT_BLOCK ||
          0
      ),

      targetBlock,
    });

    await syncContractRange({
      contractName: 'SAL1155',

      contract:
        clients.salContract,

      handlers:
        salHandlers,

      deploymentBlock: Number(
        process.env
          .SAL_DEPLOYMENT_BLOCK || 0
      ),

      targetBlock,
    });

    await syncContractRange({
      contractName:
        'GreenCertificateSBT',

      contract:
        clients.certificateContract,

      handlers:
        certificateHandlers,

      deploymentBlock: Number(
        process.env
          .CERTIFICATE_DEPLOYMENT_BLOCK ||
          0
      ),

      targetBlock,
    });

    completedSuccessfully = true;
  } catch (error) {
    lastSyncError =
      getRpcErrorMessage(error) ||
      error.message;
    lastSyncErrorAt = new Date();

    console.error(
      '❌ Lỗi đồng bộ blockchain:',
      lastSyncError
    );
  } finally {
    if (completedSuccessfully) {
      lastSyncCompletedAt = new Date();
      lastSyncError = null;
      lastSyncErrorAt = null;
    }
    syncInProgress = false;
  }
};

const syncRetirementTransaction =
  async (txHash) => {
    if (
      !/^0x[a-fA-F0-9]{64}$/.test(
        txHash
      )
    ) {
      throw new Error(
        'Transaction hash không hợp lệ'
      );
    }

    const clients =
      getBlockchainClients();

    const receipt =
      await clients.provider
        .getTransactionReceipt(txHash);

    if (!receipt) {
      return null;
    }

    if (receipt.status !== 1) {
      throw new Error(
        'Giao dịch đã bị revert'
      );
    }

    let certificate = null;

    const marketplaceAddress = lower(
      await clients.marketplaceContract
        .getAddress()
    );

    const certificateAddress = lower(
      await clients.certificateContract
        .getAddress()
    );

    for (const log of receipt.logs) {
      if (
        lower(log.address) ===
        marketplaceAddress
      ) {
        const result =
          await processLog(
            log,
            clients.marketplaceContract
              .interface,
            {
              SALRetired:
                handleSALRetired,

              MultiProjectSALRetired:
                handleMultiProjectSALRetired,

              CertificateMintFeeCollected:
                handleCertificateMintFeeCollected,
            }
          );

        if (result) {
          certificate = result;
        }
      }
    }

    for (const log of receipt.logs) {
      if (
        lower(log.address) ===
        certificateAddress
      ) {
        const result =
          await processLog(
            log,
            clients.certificateContract
              .interface,
            {
              CertificateMinted:
                handleCertificateMinted,
            }
          );

        if (result) {
          certificate = result;
        }
      }
    }

    return certificate;
  };

const startBlockchainIndexer =
  async () => {
    getBlockchainClients();
    indexerStartedAt = indexerStartedAt || new Date();

    console.log(
      '🎧 SAL blockchain indexer đang đồng bộ event lịch sử và event mới...'
    );

    await syncBlockchainEvents();

    const intervalMs = Number(
      process.env
        .BLOCKCHAIN_SYNC_INTERVAL_MS ||
        15000
    );

    pollingTimer = setInterval(
      syncBlockchainEvents,
      intervalMs
    );

    pollingTimer.unref?.();
  };

const getBlockchainIndexerStatus = () => ({
  started: Boolean(indexerStartedAt),
  startedAt: indexerStartedAt,
  syncInProgress,
  lastSyncStartedAt,
  lastSyncCompletedAt,
  lastSyncError,
  lastSyncErrorAt,
  lastTargetBlock,
  pollingEnabled: Boolean(pollingTimer),
});

module.exports = {
  getBlockchainIndexerStatus,
  startBlockchainIndexer,
  syncBlockchainEvents,
  syncRetirementTransaction,
};