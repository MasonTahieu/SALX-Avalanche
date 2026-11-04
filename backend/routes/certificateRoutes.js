const express = require('express');
const { ethers } = require('ethers');
const Certificate = require('../Models/Certificate');
const { createCertificateMetadata } = require('../services/certificateMetadataService');
const { syncRetirementTransaction } = require('../services/blockchainListener');
const { ipfsToHttp } = require('../services/ipfsService');

const router = express.Router();

const serializeCertificate = (certificate) => {
  const data = certificate?.toObject ? certificate.toObject() : certificate;
  if (!data) return null;

  const sources = Array.isArray(data.sources) && data.sources.length > 0
    ? data.sources
    : Number(data.projectId) > 0
      ? [{
          projectId: Number(data.projectId),
          projectName: data.projectName || `Dự án #${data.projectId}`,
          retiredTokenAmount: Number(data.retiredTokenAmount || 0),
          retiredCO2Kg: Number(data.retiredCO2Kg || 0),
        }]
      : [];

  return {
    ...data,
    projectCount: data.projectCount || sources.length || 1,
    sources,
    certificateURIHttp: ipfsToHttp(data.certificateURI),
    imageURL: ipfsToHttp(data.imageURI || data.metadata?.image),
    explorerURL: data.txHash
      ? `${(process.env.BLOCK_EXPLORER_URL || 'https://testnet.snowtrace.io').replace(/\/$/, '')}/tx/${data.txHash}`
      : null,
  };
};

// Tạo metadata + chữ ký EIP-712 trước khi gọi retireSAL multi-project.
// Body mới:
// {
//   ownerAddress,
//   projectIds: [1, 4, 8],
//   salAmounts: [20, 10, 5]
// }
//
// Backward-compatible: { ownerAddress, projectId, amount }
// vẫn hoạt động cho retirement chỉ có 1 project.
router.post('/metadata', async (req, res) => {
  try {
    const {
      ownerAddress,
      walletAddress,
      projectIds,
      salAmounts,
      amounts,
      projectId,
      amount,
    } = req.body;

    const owner = ownerAddress || walletAddress;

    const draft = await createCertificateMetadata({
      ownerAddress: owner,
      projectIds,
      salAmounts,
      amounts,
      projectId,
      amount,
    });

    res.status(201).json({
      message: 'Đã tạo metadata chứng chỉ multi-project trên IPFS',
      metadataRequestId: draft.metadataRequestId,
      certificateURI: draft.certificateURI,
      metadataCID: draft.metadataCID,
      imageURI: draft.imageURI,
      metadata: draft.metadata,
      retirement: {
        projectCount: draft.projectCount,
        projectIds: (draft.sources || []).map((source) => source.projectId),
        salAmounts: (draft.sources || []).map((source) => source.retiredTokenAmount),
        totalSALAmount: draft.retiredTokenAmount,
        totalCO2Kg: draft.retiredCO2Kg,
        sources: draft.sources || [],
      },
      authorization: {
        nonce: draft.metadataNonce,
        deadline: draft.metadataDeadline,
        signature: draft.metadataSignature,
        signer: draft.metadataSignerAddress,
      },
    });
  } catch (error) {
    console.error('❌ Lỗi tạo metadata chứng chỉ:', error.message);
    const message = String(error?.message || 'Không thể tạo metadata chứng chỉ');
    const status = /cùng nonce|request retirement khác/i.test(message)
      ? 409
      : /không hợp lệ|số nguyên|không tìm thấy|chưa được cấu hình|không đủ SAL|không khớp|không ở trạng thái|ít nhất|tối đa|cùng số phần tử|trùng project|pause|blacklist|Smart contract/i.test(message)
        ? 400
        : 500;
    res.status(status).json({ error: message });
  }
});

// Trả chứng chỉ theo transaction hash. Nếu listener chưa kịp đồng bộ,
// backend tự đọc receipt và parse các event retirement ngay lập tức.
router.get('/tx/:txHash', async (req, res) => {
  try {
    const txHash = req.params.txHash.toLowerCase();
    if (!/^0x[a-f0-9]{64}$/.test(txHash)) {
      return res.status(400).json({ error: 'Transaction hash không hợp lệ' });
    }

    let certificate = await Certificate.findOne({ txHash });
    if (!certificate) {
      certificate = await syncRetirementTransaction(txHash);
    }

    if (!certificate) {
      return res.status(202).json({
        status: 'PENDING',
        message: 'Giao dịch chưa được xác nhận hoặc chưa phát hiện event MultiProjectSALRetired/CertificateMinted',
        txHash,
      });
    }

    res.status(200).json(serializeCertificate(certificate));
  } catch (error) {
    console.error('❌ Lỗi truy xuất chứng chỉ theo tx:', error.message);
    res.status(500).json({ error: error.message });
  }
});

router.get('/token/:tokenId', async (req, res) => {
  try {
    const tokenId = Number(req.params.tokenId);
    if (!Number.isSafeInteger(tokenId) || tokenId <= 0) {
      return res.status(400).json({ error: 'Token ID không hợp lệ' });
    }

    const certificate = await Certificate.findOne({
      chainId: Number(process.env.CHAIN_ID || 43113),
      certificateContractAddress: process.env.GREEN_CERTIFICATE_SBT_ADDRESS?.toLowerCase(),
      certificateTokenId: tokenId,
    });

    if (!certificate) {
      return res.status(404).json({ error: 'Không tìm thấy chứng chỉ' });
    }

    res.status(200).json(serializeCertificate(certificate));
  } catch (error) {
    console.error('❌ Lỗi truy xuất chứng chỉ:', error.message);
    res.status(500).json({ error: 'Không thể tải chứng chỉ' });
  }
});

router.get('/wallet/:address', async (req, res) => {
  try {
    const address = req.params.address.toLowerCase();
    if (!ethers.isAddress(address)) {
      return res.status(400).json({ error: 'Địa chỉ ví không hợp lệ' });
    }

    const certificates = await Certificate.find({
      ownerAddress: address,
      status: { $in: ['ACTIVE', 'REVOKED'] },
    }).sort({ mintedAt: -1, createdAt: -1 });

    res.status(200).json(certificates.map(serializeCertificate));
  } catch (error) {
    console.error('❌ Lỗi tải chứng chỉ theo ví:', error.message);
    res.status(500).json({ error: 'Không thể tải danh sách chứng chỉ' });
  }
});

router.get('/:tokenId/metadata', async (req, res) => {
  try {
    const tokenId = Number(req.params.tokenId);
    const certificate = await Certificate.findOne({ certificateTokenId: tokenId });
    if (!certificate) {
      return res.status(404).json({ error: 'Không tìm thấy metadata chứng chỉ' });
    }

    res.status(200).json(certificate.metadata || {});
  } catch (error) {
    res.status(500).json({ error: 'Không thể tải metadata chứng chỉ' });
  }
});

module.exports = router;
