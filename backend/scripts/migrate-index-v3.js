require('dotenv').config();
const mongoose = require('mongoose');
const { ethers } = require('ethers');
const User = require('../Models/User');
const Project = require('../Models/Project');
const ProjectVote = require('../Models/ProjectVote');
const Listing = require('../Models/Listing');
const Certificate = require('../Models/Certificate');
const SyncState = require('../Models/SyncState');
const { expireStaleCertificateDrafts } = require('../services/certificateMetadataService');

const main = async () => {
  if (!process.env.MONGODB_URI) throw new Error('Thiếu MONGODB_URI');
  if (!ethers.isAddress(process.env.MARKETPLACE_CONTRACT_ADDRESS || '')) {
    throw new Error('MARKETPLACE_CONTRACT_ADDRESS không hợp lệ');
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const chainId = Number(process.env.CHAIN_ID || 43113);
  const marketplaceContractAddress = process.env.MARKETPLACE_CONTRACT_ADDRESS.toLowerCase();

  const users = await User.find();
  for (const user of users) {
    const update = {
      email: String(user.email || '').trim().toLowerCase(),
    };

    if (ethers.isAddress(user.parentWalletAddress || '')) {
      update.parentWalletAddress = ethers.getAddress(
        user.parentWalletAddress
      ).toLowerCase();
    }

    update.childWallets = (user.childWallets || [])
      .filter((wallet) => ethers.isAddress(wallet.address || ''))
      .map((wallet) => ({
        address: ethers.getAddress(wallet.address).toLowerCase(),
        label: wallet.label || 'Ví phụ',
        createdAt: wallet.createdAt || new Date(),
      }));

    await User.updateOne({ _id: user._id }, { $set: update });
  }

  const projectResult = await Project.updateMany(
    { onChainProjectId: { $type: 'number' } },
    {
      $set: {
        chainId,
        marketplaceContractAddress,
      },
    }
  );

  await expireStaleCertificateDrafts();

  await Promise.all([
    User.syncIndexes(),
    Project.syncIndexes(),
    ProjectVote.syncIndexes(),
    Listing.syncIndexes(),
    Certificate.syncIndexes(),
  ]);

  if (process.argv.includes('--reset-sync')) {
    const addresses = [
      process.env.MARKETPLACE_CONTRACT_ADDRESS,
      process.env.SAL_CONTRACT_ADDRESS,
      process.env.GREEN_CERTIFICATE_SBT_ADDRESS,
    ]
      .filter(Boolean)
      .map((address) => address.toLowerCase());

    const resetResult = await SyncState.deleteMany({
      chainId,
      contractAddress: { $in: addresses },
    });
    console.log(`Đã xóa ${resetResult.deletedCount} SyncState để indexer replay event.`);
  }

  console.log(`Đã cập nhật ${projectResult.modifiedCount} project sang scope chain/contract.`);
  console.log('Migration index v3 hoàn tất.');
};

main()
  .catch((error) => {
    console.error('Migration thất bại:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
