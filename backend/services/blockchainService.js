const { ethers } = require('ethers');
const marketplaceABI = require('../abis/SALMarketplace.json');

let provider;
let adminWallet;
let marketplaceContract;
let readOnlyMarketplaceContract;
let validatorWallet;
let validatorMarketplaceContract;

const requireAddress = (name) => {
  const value = process.env[name];
  if (!value || !ethers.isAddress(value)) {
    throw new Error(`${name} chưa được cấu hình đúng`);
  }
  return value;
};

const getProvider = () => {
  if (!provider) {
    if (!process.env.RPC_URL) throw new Error('Thiếu RPC_URL');
    provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  }
  return provider;
};

const getReadOnlyMarketplace = () => {
  if (!readOnlyMarketplaceContract) {
    readOnlyMarketplaceContract = new ethers.Contract(
      requireAddress('MARKETPLACE_CONTRACT_ADDRESS'),
      marketplaceABI.abi,
      getProvider()
    );
  }
  return readOnlyMarketplaceContract;
};

const getContracts = () => {
  const rpcProvider = getProvider();
  if (!adminWallet) {
    if (!process.env.ADMIN_PRIVATE_KEY) {
      throw new Error('Thiếu ADMIN_PRIVATE_KEY trong .env');
    }
    adminWallet = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY, rpcProvider);
  }
  if (!marketplaceContract) {
    marketplaceContract = new ethers.Contract(
      requireAddress('MARKETPLACE_CONTRACT_ADDRESS'),
      marketplaceABI.abi,
      adminWallet
    );
  }
  return { marketplaceContract, adminWallet, provider: rpcProvider };
};

const getValidatorContracts = () => {
  const rpcProvider = getProvider();
  if (!validatorWallet) {
    const validatorKey = process.env.VALIDATOR_PRIVATE_KEY || process.env.ADMIN_PRIVATE_KEY;
    if (!validatorKey) throw new Error('Thiếu VALIDATOR_PRIVATE_KEY hoặc ADMIN_PRIVATE_KEY');
    validatorWallet = new ethers.Wallet(validatorKey, rpcProvider);
  }
  if (!validatorMarketplaceContract) {
    validatorMarketplaceContract = new ethers.Contract(
      requireAddress('MARKETPLACE_CONTRACT_ADDRESS'),
      marketplaceABI.abi,
      validatorWallet
    );
  }
  return { marketplaceContract: validatorMarketplaceContract, validatorWallet };
};


const getProjectSubmissionQuote = async (proposedCO2Kg, ownerWallet) => {
  const amount = Number(proposedCO2Kg);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error('proposedCO2Kg phải là số nguyên dương');
  }

  const market = getReadOnlyMarketplace();
  const [kgPerSALRaw, feePerSALRaw, paused, ownerBlacklisted] = await Promise.all([
    market.KG_CO2_PER_SAL(),
    market.salTokenizationFeePerSAL(),
    market.paused(),
    ownerWallet && ethers.isAddress(ownerWallet)
      ? market.blacklistedOwners(ownerWallet)
      : Promise.resolve(false),
  ]);

  const kgPerSAL = Number(kgPerSALRaw);
  const maximumSALAmount = Math.floor(amount / kgPerSAL);
  const requiredDepositWei = BigInt(maximumSALAmount) * feePerSALRaw;

  return {
    kgPerSAL,
    maximumSALAmount,
    feePerSALWei: feePerSALRaw.toString(),
    feePerSAL_ETH: ethers.formatEther(feePerSALRaw),
    requiredDepositWei: requiredDepositWei.toString(),
    requiredDepositETH: ethers.formatEther(requiredDepositWei),
    marketplacePaused: Boolean(paused),
    ownerBlacklisted: Boolean(ownerBlacklisted),
  };
};

const approveAndMintOnChain = async (onChainProjectId, approvedCO2Kg, tokenURI) => {
  const { marketplaceContract: market } = getContracts();
  const tx = await market.approveAndMintSAL(onChainProjectId, approvedCO2Kg, tokenURI);
  const receipt = await tx.wait(1);
  return { txHash: receipt.hash, blockNumber: receipt.blockNumber };
};

const addValidatorOnChain = async (validatorAddress) => {
  const { marketplaceContract: market } = getContracts();
  const tx = await market.addValidator(validatorAddress);
  const receipt = await tx.wait(1);
  return { txHash: receipt.hash, blockNumber: receipt.blockNumber };
};

const removeValidatorOnChain = async (validatorAddress) => {
  const { marketplaceContract: market } = getContracts();
  const tx = await market.removeValidator(validatorAddress);
  const receipt = await tx.wait(1);
  return { txHash: receipt.hash, blockNumber: receipt.blockNumber };
};

const getProjectOnChain = async (onChainProjectId) => {
  const market = getReadOnlyMarketplace();
  const [project, eligibleValidatorCount, approvalQuorum] = await Promise.all([
    market.projects(onChainProjectId),
    market.projectEligibleValidatorCount(onChainProjectId),
    market.projectApprovalQuorum(onChainProjectId),
  ]);

  return {
    projectId: Number(project.projectId),
    owner: project.owner,
    projectURI: project.projectURI,
    proposedCO2Kg: Number(project.proposedCO2Kg),
    approvedCO2Kg: Number(project.approvedCO2Kg),
    approved: project.approved,
    blacklisted: project.blacklisted,
    createdAt: Number(project.createdAt),
    exists: project.exists,
    cancelled: project.cancelled,
    eligibleValidatorCount: Number(eligibleValidatorCount),
    approvalQuorum: Number(approvalQuorum),
  };
};

const getListingOnChain = async (listingId) => {
  const market = getReadOnlyMarketplace();
  const listing = await market.listings(listingId);
  return {
    listingId: Number(listing.listingId),
    projectId: Number(listing.projectId),
    seller: listing.seller,
    amount: Number(listing.amount),
    pricePerUnit: ethers.formatEther(listing.pricePerUnit),
    active: listing.active,
    createdAt: Number(listing.createdAt),
  };
};

const voteOnProject = async (onChainProjectId, approve = true) => {
  const { marketplaceContract: market } = getValidatorContracts();
  const tx = await market.voteOnProject(onChainProjectId, approve);
  const receipt = await tx.wait(1);
  return { txHash: receipt.hash, blockNumber: receipt.blockNumber };
};


const pauseMarketplaceOnChain = async () => {
  const { marketplaceContract: market } = getContracts();
  const tx = await market.pause();
  const receipt = await tx.wait(1);
  return { txHash: receipt.hash, blockNumber: receipt.blockNumber };
};

const unpauseMarketplaceOnChain = async () => {
  const { marketplaceContract: market } = getContracts();
  const tx = await market.unpause();
  const receipt = await tx.wait(1);
  return { txHash: receipt.hash, blockNumber: receipt.blockNumber };
};

const blacklistProjectOnChain = async (projectId, reason) => {
  const { marketplaceContract: market } = getContracts();
  const tx = await market.blacklistProject(projectId, reason);
  const receipt = await tx.wait(1);
  return { txHash: receipt.hash, blockNumber: receipt.blockNumber };
};

const unblacklistProjectOnChain = async (projectId) => {
  const { marketplaceContract: market } = getContracts();
  const tx = await market.unblacklistProject(projectId);
  const receipt = await tx.wait(1);
  return { txHash: receipt.hash, blockNumber: receipt.blockNumber };
};

const blacklistOwnerOnChain = async (address, reason) => {
  const { marketplaceContract: market } = getContracts();
  const tx = await market.blacklistOwner(address, reason);
  const receipt = await tx.wait(1);
  return { txHash: receipt.hash, blockNumber: receipt.blockNumber };
};

const unblacklistOwnerOnChain = async (address) => {
  const { marketplaceContract: market } = getContracts();
  const tx = await market.unblacklistOwner(address);
  const receipt = await tx.wait(1);
  return { txHash: receipt.hash, blockNumber: receipt.blockNumber };
};

module.exports = {
  getProvider,
  approveAndMintOnChain,
  getProjectSubmissionQuote,
  addValidatorOnChain,
  removeValidatorOnChain,
  getProjectOnChain,
  getListingOnChain,
  voteOnProject,
  pauseMarketplaceOnChain,
  unpauseMarketplaceOnChain,
  blacklistProjectOnChain,
  unblacklistProjectOnChain,
  blacklistOwnerOnChain,
  unblacklistOwnerOnChain,
};
