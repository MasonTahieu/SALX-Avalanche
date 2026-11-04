const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Project = require('../Models/Project');
const Certificate = require('../Models/Certificate');
const ProjectVote = require('../Models/ProjectVote');
const {
  approveAndMintOnChain,
  getProjectOnChain,
  getProjectSubmissionQuote,
  voteOnProject,
} = require('../services/blockchainService');
const {
  buildProjectSubmissionMetadata,
  createCarbonCreditMetadata,
  createProjectSubmissionMetadata,
  validateProjectMetadataAgainstSubmission,
} = require('../services/projectMetadataService');
const { fetchJSONFromURI } = require('../services/ipfsService');


const currentProjectScope = () => ({
  chainId: Number(process.env.CHAIN_ID || 43113),
  marketplaceContractAddress: String(
    process.env.MARKETPLACE_CONTRACT_ADDRESS || ''
  ).toLowerCase(),
});

// MongoDB là read model/index. Trạng thái nghiệp vụ chính thức của project đến từ blockchain events.
const PROJECT_SOURCE_OF_TRUTH = 'blockchain';

const requireAdmin = (req, res, next) => {
  const adminKey = req.headers['x-admin-key'];
  if (!adminKey || adminKey !== process.env.ADMIN_SECRET_KEY) {
    return res.status(403).json({ error: '⛔ Không có quyền Admin!' });
  }
  next();
};

const requireMongoId = (value, res) => {
  if (!mongoose.isValidObjectId(value)) {
    res.status(400).json({ error: 'Project MongoDB id không hợp lệ' });
    return false;
  }
  return true;
};

// ==========================================
// 1. TẠO PROJECT SUBMISSION METADATA
// POST /api/projects/metadata
// Body tối thiểu: { projectName, description, ownerWallet, proposedCO2Kg }
// API chỉ tạo metadata/IPFS. Project chính thức được index sau event ProjectSubmitted.
// ==========================================
router.post('/metadata', async (req, res) => {
  try {
    // Validate trước khi gọi RPC/Pinata để tránh tạo metadata rác.
    const preview = buildProjectSubmissionMetadata(req.body);
    const quote = await getProjectSubmissionQuote(
      preview.normalized.proposedCO2Kg,
      preview.normalized.ownerWallet
    );

    if (quote.marketplacePaused) {
      return res.status(409).json({
        error: 'SALMarketplace đang pause, chưa thể submit project',
      });
    }

    if (quote.ownerBlacklisted) {
      return res.status(403).json({
        error: 'Ví chủ dự án đang bị blacklist trên SALMarketplace',
      });
    }

    const generated = await createProjectSubmissionMetadata(req.body);

    return res.status(201).json({
      message: '✅ Đã tạo project metadata và pin lên IPFS',
      projectURI: generated.projectURI,
      ipfsHash: generated.cid,
      metadata: generated.metadata,
      sourceOfTruth: PROJECT_SOURCE_OF_TRUTH,
      nextAction: {
        contract: process.env.MARKETPLACE_CONTRACT_ADDRESS,
        method: 'submitProject',
        args: [generated.projectURI, generated.normalized.proposedCO2Kg],
        valueWei: quote.requiredDepositWei,
        valueETH: quote.requiredDepositETH,
      },
      quote,
      note:
        'Backend chưa tạo Project trong MongoDB ở bước này. Indexer sẽ tạo/cập nhật Project sau khi nhận event ProjectSubmitted đã xác nhận.',
    });
  } catch (error) {
    console.error('❌ Lỗi tạo project metadata:', error.response?.data || error.message);

    if (error.response || error.$metadata || /pinata|filebase|ipfs/i.test(error.message || '')) {
      return res.status(502).json({
        error: 'Không thể pin project metadata lên IPFS',
        details: error.response?.data || error.message,
      });
    }

    if (/rpc|network|timeout|could not coalesce|missing response/i.test(error.message || '')) {
      return res.status(503).json({
        error: 'Không thể lấy tokenization fee từ blockchain',
        details: error.message,
      });
    }

    return res.status(400).json({ error: error.message });
  }
});

// ==========================================
// LEGACY: route cũ từng tạo Pending project trực tiếp trong MongoDB.
// Giữ phản hồi 410 để client cũ không ghi dữ liệu lệch blockchain.
// ==========================================
router.post('/create', (req, res) => {
  return res.status(410).json({
    error: 'Route /api/projects/create đã ngừng sử dụng',
    replacement: 'POST /api/projects/metadata rồi gọi SALMarketplace.submitProject bằng ví chủ dự án',
    sourceOfTruth: PROJECT_SOURCE_OF_TRUTH,
  });
});

// ==========================================
// 2. THỐNG KÊ TỔNG QUAN
// GET /api/projects/stats
// ==========================================
router.get('/stats', async (req, res) => {
  try {
    const scope = currentProjectScope();
    const totalApprovedProjects = await Project.countDocuments({ ...scope, status: 'Approved' });

    const projectAggregation = await Project.aggregate([
      { $match: { ...scope, status: 'Approved' } },
      { $group: { _id: null, totalAvailableCarbon: { $sum: '$totalCarbon' } } },
    ]);
    const totalAvailableCarbon = projectAggregation[0]?.totalAvailableCarbon || 0;

    const retiredAggregation = await Certificate.aggregate([
      { $match: { status: 'ACTIVE' } },
      { $group: { _id: null, totalRetiredCarbon: { $sum: '$retiredCO2Kg' } } },
    ]);
    const totalRetiredCarbon = retiredAggregation[0]?.totalRetiredCarbon || 0;

    res.status(200).json({
      totalApprovedProjects,
      totalAvailableCarbon,
      totalRetiredCarbon,
      sourceOfTruth: PROJECT_SOURCE_OF_TRUTH,
    });
  } catch (error) {
    console.error('❌ Lỗi khi lấy thống kê:', error);
    res.status(500).json({ error: 'Không thể tải dữ liệu thống kê.' });
  }
});

// ==========================================
// 3. LẤY DANH SÁCH DỰ ÁN ĐÃ INDEX
// GET /api/projects?status=approved|pending|rejected|cancelled|all
// ==========================================
router.get('/', async (req, res) => {
  try {
    const status = req.query.status?.toString().toLowerCase();
    const scope = currentProjectScope();
    let filter = { ...scope, status: 'Approved' };

    if (status === 'all') filter = { ...scope };
    else if (status === 'pending') filter = { ...scope, status: 'Pending' };
    else if (status === 'rejected') filter = { ...scope, status: 'Rejected' };
    else if (status === 'cancelled') filter = { ...scope, status: 'Cancelled' };
    else if (status === 'approved') filter = { ...scope, status: 'Approved' };

    const projects = await Project.find(filter).sort({ createdAt: -1 });
    res.status(200).json(projects);
  } catch (error) {
    console.error('❌ Lỗi truy xuất dự án:', error);
    res.status(500).json({ error: 'Không thể lấy danh sách dự án.' });
  }
});

// ==========================================
// 4. LẤY DANH SÁCH DỰ ÁN CHỜ DUYỆT (Admin)
// ==========================================
router.get('/pending', requireAdmin, async (req, res) => {
  try {
    const pendingProjects = await Project.find({
      ...currentProjectScope(),
      status: 'Pending',
    }).sort({ createdAt: -1 });
    res.status(200).json(pendingProjects);
  } catch (error) {
    console.error('❌ Lỗi lấy danh sách pending:', error);
    res.status(500).json({ error: 'Không thể tải danh sách dự án chờ duyệt.' });
  }
});

// Chỉ phục vụ dữ liệu legacy đã tồn tại; smart contract hiện không có trạng thái Rejected.
router.get('/rejected', requireAdmin, async (req, res) => {
  try {
    const rejectedProjects = await Project.find({ status: 'Rejected' }).sort({ createdAt: -1 });
    res.status(200).json({
      projects: rejectedProjects,
      legacyOnly: true,
      note: 'Smart contract hiện tại không có trạng thái Project Rejected.',
    });
  } catch (error) {
    console.error('❌ Lỗi lấy danh sách rejected:', error);
    res.status(500).json({ error: 'Không thể tải danh sách dự án legacy bị từ chối.' });
  }
});


// Tiến trình vote đã được index từ event ProjectApprovalVoted.
router.get('/votes/:onChainProjectId', async (req, res) => {
  try {
    const projectId = Number(req.params.onChainProjectId);
    if (!Number.isSafeInteger(projectId) || projectId <= 0) {
      return res.status(400).json({ error: 'onChainProjectId không hợp lệ' });
    }

    const scope = currentProjectScope();
    const [project, votes] = await Promise.all([
      Project.findOne({ ...scope, onChainProjectId: projectId }),
      ProjectVote.find({
        chainId: scope.chainId,
        marketplaceContractAddress: scope.marketplaceContractAddress,
        projectId,
      }).sort({ votedAt: 1 }),
    ]);

    if (!project) {
      return res.status(404).json({ error: 'Không tìm thấy project đã index' });
    }

    return res.status(200).json({
      projectId,
      approvalVotes: project.approvalVotes || 0,
      rejectionVotes: project.rejectionVotes || 0,
      approvalQuorum: project.approvalQuorum || 0,
      eligibleValidatorCount: project.eligibleValidatorCount || 0,
      quorumReached: (project.approvalVotes || 0) >= (project.approvalQuorum || 0),
      votes,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Không thể tải tiến trình vote' });
  }
});

// ==========================================
// 5. PHÊ DUYỆT DỰ ÁN (Admin)
// PUT /api/projects/approve/:id
// Body: { approvedCO2Kg, onChainProjectId?, tokenURI? }
// ==========================================
router.put('/approve/:id', requireAdmin, async (req, res) => {
  try {
    const mongoProjectId = req.params.id.trim();
    if (!requireMongoId(mongoProjectId, res)) return;

    const { onChainProjectId, approvedCO2Kg, tokenURI } = req.body;
    const approvedAmount = Number(approvedCO2Kg);

    if (!Number.isSafeInteger(approvedAmount) || approvedAmount <= 0) {
      return res.status(400).json({ error: 'approvedCO2Kg phải là số nguyên dương' });
    }
    if (approvedAmount % 10 !== 0) {
      return res.status(400).json({ error: 'approvedCO2Kg phải chia hết cho 10 kg CO2e' });
    }

    const project = await Project.findById(mongoProjectId);
    if (!project) {
      return res.status(404).json({ error: 'Không tìm thấy dự án này trong hệ thống!' });
    }

    const resolvedOnChainProjectId = Number(onChainProjectId ?? project.onChainProjectId);
    if (!Number.isSafeInteger(resolvedOnChainProjectId) || resolvedOnChainProjectId <= 0) {
      return res.status(400).json({
        error: 'Dự án chưa có onChainProjectId hợp lệ. Hãy chờ indexer nhận ProjectSubmitted.',
      });
    }

    if (
      project.onChainProjectId != null &&
      Number(project.onChainProjectId) !== resolvedOnChainProjectId
    ) {
      return res.status(409).json({
        error: 'onChainProjectId gửi lên không khớp bản ghi đã index',
      });
    }

    const onChainProject = await getProjectOnChain(resolvedOnChainProjectId);
    if (!onChainProject.exists) {
      return res.status(404).json({ error: 'Project không tồn tại trên SALMarketplace' });
    }
    if (onChainProject.approved) {
      return res.status(409).json({ error: 'Project đã được approve on-chain' });
    }
    if (onChainProject.cancelled || onChainProject.blacklisted) {
      return res.status(409).json({ error: 'Project đã cancelled hoặc bị blacklist on-chain' });
    }
    if (approvedAmount > onChainProject.proposedCO2Kg) {
      return res.status(400).json({
        error: 'approvedCO2Kg không được vượt proposedCO2Kg on-chain',
      });
    }
    if (project.ownerWallet?.toLowerCase() !== onChainProject.owner.toLowerCase()) {
      return res.status(409).json({
        error: 'ownerWallet trong MongoDB không khớp owner của project on-chain',
      });
    }

    let metadata = project.projectMetadata;
    if (!metadata && project.projectURI) {
      try {
        metadata = await fetchJSONFromURI(project.projectURI);
      } catch (_) {
        metadata = null;
      }
    }

    const metadataValidation = validateProjectMetadataAgainstSubmission(metadata, {
      ownerWallet: onChainProject.owner,
      proposedCO2Kg: onChainProject.proposedCO2Kg,
    });

    await Project.findByIdAndUpdate(project._id, {
      projectMetadata: metadata,
      metadataValidationStatus: metadataValidation.status,
      metadataValidationErrors: metadataValidation.errors,
      metadataValidatedAt: new Date(),
    });

    if (metadataValidation.status !== 'VALID') {
      return res.status(409).json({
        error: 'Project metadata không khớp dữ liệu submit on-chain',
        metadataValidation,
      });
    }

    let resolvedTokenURI = tokenURI;
    let generatedMetadata = null;
    if (!resolvedTokenURI) {
      const generated = await createCarbonCreditMetadata({
        project,
        onChainProjectId: resolvedOnChainProjectId,
        approvedCO2Kg: approvedAmount,
      });
      resolvedTokenURI = generated.uri;
      generatedMetadata = generated.metadata;
    }

    if (typeof resolvedTokenURI !== 'string' || !resolvedTokenURI.startsWith('ipfs://')) {
      return res.status(400).json({ error: 'tokenURI phải có định dạng ipfs://...' });
    }

    console.log(
      `⏳ Đang gọi approveAndMintSAL cho project on-chain #${resolvedOnChainProjectId}...`
    );
    const { txHash, blockNumber } = await approveAndMintOnChain(
      resolvedOnChainProjectId,
      approvedAmount,
      resolvedTokenURI
    );

    // Transaction đã được xác nhận. Indexer vẫn là cơ chế chuẩn để replay/reconcile dữ liệu.
    const updatedProject = await Project.findByIdAndUpdate(
      mongoProjectId,
      {
        status: 'Approved',
        onChainProjectId: resolvedOnChainProjectId,
        approvedCO2Kg: approvedAmount,
        totalCarbon: approvedAmount,
        mintedTokenAmount: approvedAmount / 10,
        tokenURI: resolvedTokenURI,
        ...(generatedMetadata && { tokenMetadata: generatedMetadata }),
      },
      { returnDocument: 'after' }
    );

    res.status(200).json({
      message: '✅ Dự án đã được approve và mint SAL trên blockchain',
      txHash,
      blockNumber,
      tokenURI: resolvedTokenURI,
      project: updatedProject,
      sourceOfTruth: PROJECT_SOURCE_OF_TRUTH,
    });
  } catch (error) {
    console.error('❌ Lỗi khi duyệt dự án:', error.message);

    if (error.code === 'CALL_EXCEPTION') {
      return res.status(400).json({
        error: 'Blockchain từ chối giao dịch approveAndMintSAL',
        details: error.reason || error.shortMessage || error.message,
      });
    }

    res.status(500).json({ error: 'Lỗi server khi xử lý phê duyệt.', details: error.message });
  }
});

// ==========================================
// LEGACY: không còn ghi Rejected chỉ trong MongoDB.
// Validator dùng voteOnProject(false); chủ dự án dùng cancelPendingProject on-chain.
// ==========================================
router.put('/reject/:id', requireAdmin, (req, res) => {
  return res.status(410).json({
    error: 'Route reject MongoDB-only đã ngừng sử dụng',
    alternatives: [
      'Validator gọi POST /api/projects/vote/:onChainProjectId với approve=false',
      'Chủ dự án gọi SALMarketplace.cancelPendingProject(onChainProjectId) bằng ví của họ',
    ],
    note: 'Smart contract hiện tại không có trạng thái Rejected; backend không tự tạo trạng thái on-chain không tồn tại.',
  });
});

// ==========================================
// XÓA CHỈ DỮ LIỆU LEGACY CHƯA TỪNG INDEX ON-CHAIN
// ==========================================
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const projectId = req.params.id.trim();
    if (!requireMongoId(projectId, res)) return;

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Không tìm thấy dự án!' });
    }

    if (project.onChainProjectId != null || project.projectURI) {
      return res.status(409).json({
        error: 'Không thể xóa project đã index từ blockchain',
        alternative:
          'Dùng cancelPendingProject, blacklistProject hoặc trạng thái on-chain phù hợp; MongoDB sẽ được indexer cập nhật.',
      });
    }

    await Project.deleteOne({ _id: project._id });
    res.status(200).json({ message: '🗑️ Đã xóa bản ghi project legacy chưa có on-chainProjectId.' });
  } catch (error) {
    console.error('❌ Lỗi khi xóa project legacy:', error.message);
    res.status(500).json({ error: 'Lỗi server khi xóa project legacy.', details: error.message });
  }
});

// ==========================================
// VOTE DỰ ÁN (Validator backend demo)
// ==========================================
router.post('/vote/:onChainProjectId', requireAdmin, async (req, res) => {
  try {
    const onChainProjectId = Number(req.params.onChainProjectId);
    const approve = req.body.approve !== false;

    if (!Number.isSafeInteger(onChainProjectId) || onChainProjectId <= 0) {
      return res.status(400).json({ error: 'onChainProjectId không hợp lệ!' });
    }

    console.log(`🗳️ Đang vote ${approve ? 'duyệt' : 'không duyệt'} project #${onChainProjectId}...`);
    const { txHash, blockNumber } = await voteOnProject(onChainProjectId, approve);

    res.status(200).json({
      message: `✅ Đã vote ${approve ? 'duyệt' : 'không duyệt'} project #${onChainProjectId}`,
      txHash,
      blockNumber,
    });
  } catch (error) {
    const message = String(error?.shortMessage || error?.reason || error?.message || error || '');
    const errorText = message.toLowerCase();
    console.error('❌ Lỗi khi vote project:', message);

    if (errorText.includes('already voted') || errorText.includes('da bo phieu')) {
      return res.status(400).json({ error: 'Ví validator đã vote cho project này rồi!' });
    }
    if (errorText.includes('validator not eligible') || errorText.includes('khong phai validator')) {
      return res.status(400).json({ error: 'Ví cấu hình không đủ điều kiện vote project này!' });
    }

    res.status(500).json({ error: 'Lỗi khi vote project.', details: message });
  }
});

module.exports = router;
