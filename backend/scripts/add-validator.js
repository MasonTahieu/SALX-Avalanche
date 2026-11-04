// Thêm validator vào SALMarketplace bằng ví owner (ADMIN_PRIVATE_KEY).
// Cách dùng: node scripts/add-validator.js <địa chỉ ví validator>
require('dotenv').config();
const { ethers } = require('ethers');
const marketplaceABI = require('../abis/SALMarketplace.json');
const { addValidatorOnChain } = require('../services/blockchainService');

const run = async () => {
  const address = process.argv[2];
  if (!address || !ethers.isAddress(address)) {
    throw new Error('Cách dùng: node scripts/add-validator.js <địa chỉ ví validator>');
  }

  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const market = new ethers.Contract(process.env.MARKETPLACE_CONTRACT_ADDRESS, marketplaceABI.abi, provider);
  const admin = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY);
  const owner = await market.owner();
  if (owner.toLowerCase() !== admin.address.toLowerCase()) {
    throw new Error(`ADMIN_PRIVATE_KEY (${admin.address}) không phải owner của marketplace (${owner})`);
  }

  if (await market.isValidator(address)) {
    console.log(`ℹ️ ${address} đã là validator, không cần gửi giao dịch.`);
  } else {
    const { txHash, blockNumber } = await addValidatorOnChain(address);
    console.log(`✅ Đã thêm validator: tx ${txHash} (block ${blockNumber})`);
  }

  console.log(`Tổng số validator: ${await market.getValidatorsCount()}`);
};

run().catch((error) => {
  console.error(`❌ ${error.shortMessage || error.message}`);
  process.exit(1);
});
