const express = require('express');
const { ethers } = require('ethers');
const Certificate = require('../Models/Certificate');
const { createCertificateMetadata } = require('../services/certificateMetadataService');
const { syncRetirementTransaction } = require('../services/blockchainListener');
const { EMBEDDED_IMAGE_PROJECTION, serializeCertificate } = require('../services/certificateSerializer');
const {
  artworkInputFromCertificate,
  buildCertificateSvg,
  isCurrentArtwork,
  renderCertificatePng,
} = require('../services/certificateArtwork');
const { buildCertificateSharePage, frontendUrl, publicApiBase } = require('../services/certificateSharePage');

const router = express.Router();

// The collection strip shows thumbnails at 56 px; 168 px covers 3x screens.
const THUMB_WIDTH = 168;
const PREVIEW_WIDTH = 1000;
const DOWNLOAD_WIDTH = 2000;
const PNG_CACHE_LIMIT = 48;
const pngCache = new Map();

const decodeDataUri = (uri, mimeType) => {
  const prefix = `data:${mimeType};base64,`;
  return typeof uri === 'string' && uri.startsWith(prefix)
    ? Buffer.from(uri.slice(prefix.length), 'base64')
    : null;
};

// Certificate artwork in the current design. Certificates minted with it are
// rendered from their own minted SVG; older ones are redrawn from their stored
// data (same serial, basket, owner and date). The on-chain tokenURI is untouched.
const currentArtworkSvg = (certificate) => {
  const minted = decodeDataUri(certificate.metadata?.image_data, 'image/svg+xml')?.toString('utf8');
  if (minted && isCurrentArtwork(minted)) return minted;
  const input = artworkInputFromCertificate(certificate);
  return input ? buildCertificateSvg(input) : null;
};

const certificatePng = (certificate, width) => {
  const key = `${certificate.certificateContractAddress}:${certificate.certificateTokenId}:${width}`;
  if (pngCache.has(key)) return pngCache.get(key);

  let png = null;
  try {
    const svg = currentArtworkSvg(certificate);
    png = svg ? renderCertificatePng(svg, { width }) : null;
  } catch (error) {
    console.warn('[cert] artwork render failed, serving minted PNG:', error.message);
  }
  if (!png) {
    // Last resort: the PNG that was minted.
    return decodeDataUri(certificate.metadata?.image, 'image/png') || decodeDataUri(certificate.imageURI, 'image/png');
  }

  if (pngCache.size >= PNG_CACHE_LIMIT) pngCache.delete(pngCache.keys().next().value);
  pngCache.set(key, png);
  return png;
};

const downloadFilename = (certificate) => {
  const serial = (certificate.metadata?.attributes || [])
    .find((attribute) => attribute.trait_type === 'Certificate Serial')?.value;
  const label = String(serial || `SBT-${certificate.certificateTokenId}`).replace(/[^A-Za-z0-9-]/g, '');
  return `SALX-Certificate-${label}.png`;
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

    let certificate = await Certificate.findOne({ txHash }).select(EMBEDDED_IMAGE_PROJECTION).lean();
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
    }).select(EMBEDDED_IMAGE_PROJECTION).lean();

    if (!certificate) {
      return res.status(404).json({ error: 'Không tìm thấy chứng chỉ' });
    }

    res.status(200).json(serializeCertificate(certificate));
  } catch (error) {
    console.error('❌ Lỗi truy xuất chứng chỉ:', error.message);
    res.status(500).json({ error: 'Không thể tải chứng chỉ' });
  }
});

// Trang chia sẻ: thẻ xem trước (tiêu đề, ảnh chứng chỉ) cho LinkedIn/X, rồi chuyển
// người xem sang trang xác minh công khai của frontend.
router.get('/token/:tokenId/share', async (req, res) => {
  const tokenId = Number(req.params.tokenId);
  if (!Number.isSafeInteger(tokenId) || tokenId <= 0) {
    return res.status(400).type('text/plain').send('Token ID không hợp lệ');
  }

  let certificate = null;
  try {
    certificate = await Certificate.findOne({
      chainId: Number(process.env.CHAIN_ID || 43113),
      certificateContractAddress: process.env.GREEN_CERTIFICATE_SBT_ADDRESS?.toLowerCase(),
      certificateTokenId: tokenId,
    }).select(EMBEDDED_IMAGE_PROJECTION).lean();
  } catch (error) {
    // Without the record the page still forwards to verification, just with a plainer preview.
    console.warn('⚠️ Không đọc được chứng chỉ cho trang chia sẻ:', error.message);
  }

  const apiBase = publicApiBase(req);
  const html = buildCertificateSharePage({
    tokenId,
    certificate: certificate ? serializeCertificate(certificate) : null,
    verifyUrl: `${frontendUrl()}/verify/${tokenId}`,
    shareUrl: `${apiBase}/api/certificates/token/${tokenId}/share`,
    imageUrl: `${apiBase}/api/certificates/token/${tokenId}/image.png`,
  });
  res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' });
  return res.status(200).send(html);
});

// Ảnh chứng chỉ (PNG): mặc định 1000 px; ?size=thumb 168 px; ?download=1 tải về bản 2000 px.
router.get('/token/:tokenId/image.png', async (req, res) => {
  try {
    const tokenId = Number(req.params.tokenId);
    if (!Number.isSafeInteger(tokenId) || tokenId <= 0) {
      return res.status(400).json({ error: 'Token ID không hợp lệ' });
    }

    const certificate = await Certificate.findOne({
      chainId: Number(process.env.CHAIN_ID || 43113),
      certificateContractAddress: process.env.GREEN_CERTIFICATE_SBT_ADDRESS?.toLowerCase(),
      certificateTokenId: tokenId,
    }).lean();

    if (!certificate) {
      return res.status(404).json({ error: 'Không tìm thấy chứng chỉ' });
    }

    const download = req.query.download === '1' || req.query.download === 'true';
    const width = download ? DOWNLOAD_WIDTH : req.query.size === 'thumb' ? THUMB_WIDTH : PREVIEW_WIDTH;
    const png = certificatePng(certificate, width);
    if (!png) {
      return res.status(404).json({ error: 'Chứng chỉ chưa có ảnh để tải' });
    }

    res.set({
      'Content-Type': 'image/png',
      'Content-Length': String(png.length),
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${downloadFilename(certificate)}"`,
      'Cache-Control': 'public, max-age=3600',
    });
    res.status(200).send(png);
  } catch (error) {
    console.error('❌ Lỗi tải ảnh chứng chỉ:', error.message);
    res.status(500).json({ error: 'Không thể tải ảnh chứng chỉ' });
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
    }).sort({ mintedAt: -1, createdAt: -1 }).select(EMBEDDED_IMAGE_PROJECTION).lean();

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
