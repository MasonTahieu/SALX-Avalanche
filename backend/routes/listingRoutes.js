const express = require('express');
const { ethers } = require('ethers');
const Listing = require('../Models/Listing');

const router = express.Router();

const currentScope = () => ({
  chainId: Number(process.env.CHAIN_ID || 43113),
  marketplaceContractAddress: String(
    process.env.MARKETPLACE_CONTRACT_ADDRESS || ''
  ).toLowerCase(),
});

router.get('/', async (req, res) => {
  try {
    const filter = { ...currentScope() };

    if (req.query.active != null) {
      filter.active = String(req.query.active).toLowerCase() === 'true';
    }
    if (req.query.projectId != null) {
      const projectId = Number(req.query.projectId);
      if (!Number.isSafeInteger(projectId) || projectId <= 0) {
        return res.status(400).json({ error: 'projectId không hợp lệ' });
      }
      filter.projectId = projectId;
    }
    if (req.query.seller) {
      if (!ethers.isAddress(req.query.seller)) {
        return res.status(400).json({ error: 'seller không hợp lệ' });
      }
      filter.sellerAddress = req.query.seller.toLowerCase();
    }

    const listings = await Listing.find(filter).sort({ listingId: -1 });
    return res.status(200).json(listings);
  } catch (error) {
    return res.status(500).json({ error: 'Không thể tải danh sách listing' });
  }
});

router.get('/:listingId', async (req, res) => {
  try {
    const listingId = Number(req.params.listingId);
    if (!Number.isSafeInteger(listingId) || listingId <= 0) {
      return res.status(400).json({ error: 'listingId không hợp lệ' });
    }

    const listing = await Listing.findOne({
      ...currentScope(),
      listingId,
    });

    if (!listing) {
      return res.status(404).json({ error: 'Không tìm thấy listing' });
    }

    return res.status(200).json(listing);
  } catch (error) {
    return res.status(500).json({ error: 'Không thể tải listing' });
  }
});

module.exports = router;
