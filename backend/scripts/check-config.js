require('dotenv').config();
const { ethers } = require('ethers');

const required = [
  'MONGODB_URI',
  'RPC_URL',
  'SAL_CONTRACT_ADDRESS',
  'MARKETPLACE_CONTRACT_ADDRESS',
  'GREEN_CERTIFICATE_SBT_ADDRESS',
  'ADMIN_PRIVATE_KEY',
  'METADATA_SIGNER_PRIVATE_KEY',
];

const missing = required.filter((key) => !process.env[key]);
const ipfsProvider = (process.env.IPFS_PROVIDER || (process.env.FILEBASE_ACCESS_KEY ? 'filebase' : 'pinata')).trim().toLowerCase();
if (ipfsProvider === 'filebase') {
  missing.push(...['FILEBASE_ACCESS_KEY', 'FILEBASE_SECRET_KEY', 'FILEBASE_BUCKET'].filter((key) => !process.env[key]));
} else if (!process.env.PINATA_JWT && !(process.env.PINATA_API_KEY && process.env.PINATA_SECRET_API_KEY)) {
  missing.push('PINATA_JWT hoặc PINATA_API_KEY + PINATA_SECRET_API_KEY');
}

for (const key of [
  'SAL_CONTRACT_ADDRESS',
  'MARKETPLACE_CONTRACT_ADDRESS',
  'GREEN_CERTIFICATE_SBT_ADDRESS',
]) {
  if (process.env[key] && !ethers.isAddress(process.env[key])) {
    console.error(`❌ ${key} không phải địa chỉ Ethereum hợp lệ`);
    process.exitCode = 1;
  }
}

for (const key of ['SAL_DEPLOYMENT_BLOCK', 'MARKETPLACE_DEPLOYMENT_BLOCK', 'CERTIFICATE_DEPLOYMENT_BLOCK']) {
  const value = Number(process.env[key]);
  if (!Number.isSafeInteger(value) || value < 0) {
    console.error(`❌ ${key} phải là số block hợp lệ`);
    process.exitCode = 1;
  }
}

if (missing.length) {
  console.error(`❌ Thiếu cấu hình: ${missing.join(', ')}`);
  process.exit(1);
}
if (process.exitCode) process.exit(process.exitCode);
console.log('✅ Cấu hình backend SAL v2 hợp lệ');
