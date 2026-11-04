const crypto = require('crypto');
const { ethers } = require('ethers');
const Certificate = require('../Models/Certificate');
const Project = require('../Models/Project');
const { pinBufferToIPFS, pinJSONToIPFS } = require('./ipfsService');
const marketplaceABI = require('../abis/SALMarketplace.json');
const salABI = require('../abis/SAL1155.json');

const KG_CO2_PER_TOKEN = 10;
const MAX_RETIREMENT_PROJECTS = 5;

const escapeXml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const shortenAddress = (address) => `${address.slice(0, 8)}...${address.slice(-6)}`;
const lowerAddress = (address) => String(address || '').toLowerCase();

const normalizeRetirementBasket = ({ projectIds, salAmounts, amounts, projectId, amount }) => {
  const rawProjectIds = Array.isArray(projectIds)
    ? projectIds
    : projectId !== undefined && projectId !== null
      ? [projectId]
      : [];

  const rawAmounts = Array.isArray(salAmounts)
    ? salAmounts
    : Array.isArray(amounts)
      ? amounts
      : amount !== undefined && amount !== null
        ? [amount]
        : [];

  if (rawProjectIds.length === 0) {
    throw new Error('Phải chọn ít nhất 1 dự án để retire');
  }
  if (rawProjectIds.length > MAX_RETIREMENT_PROJECTS) {
    throw new Error(`Chỉ được retire tối đa ${MAX_RETIREMENT_PROJECTS} dự án trong một chứng chỉ`);
  }
  if (rawProjectIds.length !== rawAmounts.length) {
    throw new Error('projectIds và salAmounts phải có cùng số phần tử');
  }

  const normalizedProjectIds = rawProjectIds.map((value) => Number(value));
  const normalizedSalAmounts = rawAmounts.map((value) => Number(value));

  normalizedProjectIds.forEach((value) => {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error('Mỗi projectId phải là số nguyên dương');
    }
  });

  normalizedSalAmounts.forEach((value) => {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error('Mỗi salAmount phải là số nguyên dương');
    }
  });

  if (new Set(normalizedProjectIds).size !== normalizedProjectIds.length) {
    throw new Error('Không được chọn trùng projectId trong cùng một lần retire');
  }

  const totalSALAmount = normalizedSalAmounts.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(totalSALAmount) || totalSALAmount <= 0) {
    throw new Error('Tổng SAL retire không hợp lệ');
  }

  const retirementBasketKey = normalizedProjectIds
    .map((id, index) => `${id}:${normalizedSalAmounts[index]}`)
    .join('|');

  return {
    projectIds: normalizedProjectIds,
    salAmounts: normalizedSalAmounts,
    totalSALAmount,
    totalCO2Kg: totalSALAmount * KG_CO2_PER_TOKEN,
    retirementBasketKey,
  };
};

const buildCertificateSvg = ({ sources, ownerAddress, retiredTokenAmount, retiredCO2Kg, issuedAt, serial }) => {
  const dateStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(issuedAt);

  const tonnes = (retiredCO2Kg / 1000).toFixed(1);
  const co2Fmt = retiredCO2Kg.toLocaleString('en-US');
  const salFmt = retiredTokenAmount.toLocaleString('en-US');
  const shortOwner = shortenAddress(ownerAddress);
  const primaryProjectName = sources[0]?.projectName || '—';
  const projectLabel = escapeXml(
    primaryProjectName.length > 48 ? `${primaryProjectName.slice(0, 45)}…` : primaryProjectName
  );
  const multiNote = sources.length > 1 ? escapeXml(` + ${sources.length - 1} more`) : '';

  // ── Pills: 4 across, matching the CertificateCard Pill components ──────────────
  const PILL_W = 235;
  const PILL_GAP = 8;
  const PILL_Y = 310;
  const pillData = [
    ['CREDIT CATEGORY', 'Carbon Credits'],
    ['STANDARD', 'SALX Standard'],
    ['VINTAGE', String(issuedAt.getFullYear())],
    ['ISSUER', 'SALX'],
  ];
  const pillsSvg = pillData.map(([label, val], i) => {
    const x = 18 + i * (PILL_W + PILL_GAP);
    return [
      `<rect x="${x}" y="${PILL_Y}" width="${PILL_W}" height="70" rx="6" fill="#0d1f16" stroke="#1d3026" stroke-width="1"/>`,
      `<text x="${x + 13}" y="${PILL_Y + 22}" font-family="monospace" font-size="9" fill="#3d6050" letter-spacing="0.7">${escapeXml(label)}</text>`,
      `<text x="${x + 13}" y="${PILL_Y + 54}" font-family="Arial,sans-serif" font-size="15" font-weight="600" fill="#d1fae5">${escapeXml(val)}</text>`,
    ].join('\n  ');
  }).join('\n  ');

  // ── Metadata grid: 3 cols × 3 rows, matching the CertificateCard MetaCell grid ─
  const GRID_X = 18;
  const GRID_Y = 602;
  const CELL_W = 321;  // floor(963 / 3); grid spans 963px from x=18 to x=981
  const CELL_H = 80;
  const metaCells = [
    ['CARBON STANDARD', 'SALX Standard'],
    ['VINTAGE', String(issuedAt.getFullYear())],
    ['SAL RETIRED', `${salFmt} SAL`],
    ['CREDIT CATEGORY', 'Carbon Credits'],
    ['ISSUER', 'SALX'],
    ['PROJECTS', String(sources.length)],
    ['ISSUED ON', dateStr],
    ['BENEFICIARY', shortOwner],
    ['SERIAL', serial.length > 22 ? serial.slice(0, 22) : serial],
  ];
  const gridSvg = metaCells.map(([label, val], i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = GRID_X + col * CELL_W;
    const y = GRID_Y + row * CELL_H;
    return [
      `<rect x="${x}" y="${y}" width="${CELL_W}" height="${CELL_H}" fill="none" stroke="#1d3026" stroke-width="0.75"/>`,
      `<text x="${x + 13}" y="${y + 25}" font-family="monospace" font-size="9" fill="#3d6050" letter-spacing="0.7">${escapeXml(label)}</text>`,
      `<text x="${x + 13}" y="${y + 62}" font-family="Arial,sans-serif" font-size="14" font-weight="500" fill="#d1fae5">${escapeXml(String(val))}</text>`,
    ].join('\n  ');
  }).join('\n  ');

  // Layout heights: header 0-82, hero 82-300, pills 300-396, project 396-466,
  // statement 466-590, grid 590-842, footer 856-1000. Total = 1000px.
  const FOOTER_Y = 856;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000">
  <defs>
    <linearGradient id="hero" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#04211b"/>
      <stop offset="60%" stop-color="#062e25"/>
      <stop offset="100%" stop-color="#031713"/>
    </linearGradient>
    <linearGradient id="ov" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#04211b" stop-opacity="0"/>
      <stop offset="100%" stop-color="#04211b" stop-opacity="0.88"/>
    </linearGradient>
    <clipPath id="cr"><rect width="1000" height="1000" rx="20"/></clipPath>
  </defs>

  <!-- Card background and border -->
  <rect width="1000" height="1000" rx="20" fill="#0a1913"/>
  <rect width="1000" height="1000" rx="20" fill="none" stroke="#1d3026" stroke-width="1.5"/>

  <!-- HEADER (0–82): title + SBT serial + SALX icon -->
  <line x1="0" y1="82" x2="1000" y2="82" stroke="#1d3026" stroke-width="1"/>
  <text x="36" y="48" font-family="Arial,sans-serif" font-size="22" font-weight="700" fill="#eafff7">Carbon Retirement Certificate</text>
  <text x="36" y="70" font-family="monospace" font-size="12" fill="#2f4d3d" letter-spacing="1">SBT · ${escapeXml(serial)}</text>
  <rect x="942" y="22" width="38" height="38" rx="8" fill="#0f2a1a"/>
  <text x="961" y="47" font-family="Arial,sans-serif" font-size="16" font-weight="800" fill="#2ee68a" text-anchor="middle">S</text>

  <!-- HERO (82–300): dark gradient + CO₂ amount -->
  <rect clip-path="url(#cr)" x="0" y="82" width="1000" height="218" fill="url(#hero)"/>
  <rect clip-path="url(#cr)" x="0" y="82" width="1000" height="218" fill="url(#ov)"/>
  <text x="36" y="148" font-family="Arial,sans-serif" font-size="16" fill="rgba(209,250,229,0.65)">This certificate is proof that</text>
  <text x="36" y="228" font-family="Arial,sans-serif" font-size="62" font-weight="800" fill="#eafff7">${co2Fmt} kg CO&#x2082;e</text>
  <text x="36" y="268" font-family="Arial,sans-serif" font-size="16" fill="rgba(209,250,229,0.60)">(${tonnes} tonnes) credits have been permanently retired</text>

  <!-- PILLS (300–396): 4 attribute pills -->
  <line x1="0" y1="300" x2="1000" y2="300" stroke="#1d3026" stroke-width="1"/>
  ${pillsSvg}

  <!-- PROJECT ROW (396–466): SALX icon + project name + "by SALX" -->
  <line x1="0" y1="396" x2="1000" y2="396" stroke="#1d3026" stroke-width="1"/>
  <rect x="36" y="410" width="38" height="38" rx="8" fill="#0f2a1a"/>
  <text x="55" y="435" font-family="Arial,sans-serif" font-size="16" font-weight="800" fill="#2ee68a" text-anchor="middle">S</text>
  <text x="88" y="425" font-family="Arial,sans-serif" font-size="16" font-weight="600" fill="#eafff7">${projectLabel}${multiNote}</text>
  <text x="88" y="447" font-family="Arial,sans-serif" font-size="13" fill="#3d6050">by SALX</text>

  <!-- STATEMENT (466–590): retirement statement box -->
  <line x1="0" y1="466" x2="1000" y2="466" stroke="#1d3026" stroke-width="1"/>
  <rect x="18" y="478" width="964" height="100" rx="8" fill="#0d1f16"/>
  <text x="36" y="514" font-family="Arial,sans-serif" font-size="14" fill="#d1fae5">We are hereby permanently retiring</text>
  <text x="36" y="534" font-family="Arial,sans-serif" font-size="14" font-weight="700" fill="#2ee68a">${co2Fmt} kg CO&#x2082; equivalent (${salFmt} SAL)</text>
  <text x="36" y="554" font-family="Arial,sans-serif" font-size="14" fill="#d1fae5">on behalf of <tspan font-family="monospace" font-size="12">${escapeXml(shortOwner)}</tspan></text>

  <!-- METADATA GRID (590–842): 3×3 MetaCell grid -->
  <line x1="0" y1="590" x2="1000" y2="590" stroke="#1d3026" stroke-width="1"/>
  ${gridSvg}

  <!-- FOOTER (856–1000) -->
  <line x1="0" y1="${FOOTER_Y}" x2="1000" y2="${FOOTER_Y}" stroke="#1d3026" stroke-width="0.5"/>
  <text x="36" y="${FOOTER_Y + 38}" font-family="Arial,sans-serif" font-size="11" fill="#264035">This certificate guarantees the permanent, on-chain retirement of carbon credits registered in the SALX marketplace.</text>
  <text x="36" y="${FOOTER_Y + 56}" font-family="Arial,sans-serif" font-size="11" fill="#264035">Verification is permanently recorded on the Avalanche blockchain.</text>
  <text x="964" y="${FOOTER_Y + 80}" font-family="Arial,sans-serif" font-size="14" font-weight="700" fill="#2ee68a" text-anchor="end">salx.app</text>
</svg>`;
};

const getSigningClients = () => {
  if (!process.env.RPC_URL) throw new Error('RPC_URL chưa được cấu hình');
  if (!process.env.MARKETPLACE_CONTRACT_ADDRESS || !ethers.isAddress(process.env.MARKETPLACE_CONTRACT_ADDRESS)) {
    throw new Error('MARKETPLACE_CONTRACT_ADDRESS chưa được cấu hình đúng');
  }
  if (!process.env.SAL_CONTRACT_ADDRESS || !ethers.isAddress(process.env.SAL_CONTRACT_ADDRESS)) {
    throw new Error('SAL_CONTRACT_ADDRESS chưa được cấu hình đúng');
  }
  if (!process.env.METADATA_SIGNER_PRIVATE_KEY) {
    throw new Error('METADATA_SIGNER_PRIVATE_KEY chưa được cấu hình');
  }

  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const signer = new ethers.Wallet(process.env.METADATA_SIGNER_PRIVATE_KEY, provider);
  const marketplace = new ethers.Contract(
    process.env.MARKETPLACE_CONTRACT_ADDRESS,
    marketplaceABI.abi,
    provider
  );
  const salToken = new ethers.Contract(
    process.env.SAL_CONTRACT_ADDRESS,
    salABI.abi,
    provider
  );
  return { provider, signer, marketplace, salToken };
};

const expireStaleCertificateDrafts = async (nowUnix = Math.floor(Date.now() / 1000)) => {
  return Certificate.updateMany(
    {
      status: 'PENDING',
      metadataDeadline: { $lte: nowUnix },
    },
    {
      $set: {
        status: 'EXPIRED',
        expiredAt: new Date(),
      },
    }
  );
};

const createCertificateMetadata = async ({
  ownerAddress,
  projectIds,
  salAmounts,
  amounts,
  projectId,
  amount,
}) => {
  if (!ethers.isAddress(ownerAddress)) throw new Error('Địa chỉ ví không hợp lệ');

  const basket = normalizeRetirementBasket({ projectIds, salAmounts, amounts, projectId, amount });
  const normalizedOwner = ownerAddress.toLowerCase();
  const expectedChainId = Number(process.env.CHAIN_ID || 43113);
  const marketplaceAddress = process.env.MARKETPLACE_CONTRACT_ADDRESS?.toLowerCase();
  const salContractAddress = process.env.SAL_CONTRACT_ADDRESS?.toLowerCase();
  const certificateContractAddress = process.env.GREEN_CERTIFICATE_SBT_ADDRESS?.toLowerCase();

  if (!marketplaceAddress || !ethers.isAddress(marketplaceAddress)) {
    throw new Error('MARKETPLACE_CONTRACT_ADDRESS chưa được cấu hình đúng');
  }
  if (!salContractAddress || !ethers.isAddress(salContractAddress)) {
    throw new Error('SAL_CONTRACT_ADDRESS chưa được cấu hình đúng');
  }
  if (!certificateContractAddress || !ethers.isAddress(certificateContractAddress)) {
    throw new Error('GREEN_CERTIFICATE_SBT_ADDRESS chưa được cấu hình đúng');
  }

  const projects = await Project.find({
    chainId: expectedChainId,
    marketplaceContractAddress: marketplaceAddress,
    onChainProjectId: { $in: basket.projectIds },
    status: 'Approved',
    blacklisted: { $ne: true },
  });

  const projectMap = new Map(projects.map((project) => [Number(project.onChainProjectId), project]));
  const orderedProjects = basket.projectIds.map((id) => projectMap.get(id));
  if (orderedProjects.some((project) => !project)) {
    throw new Error('Có dự án không tìm thấy, chưa được duyệt hoặc đang bị blacklist');
  }

  const { provider, signer, marketplace, salToken } = getSigningClients();
  const [
    network,
    currentNonce,
    configuredSigner,
    marketplacePaused,
    ownerBlacklisted,
    onChainMaxProjectsRaw,
    onChainKgPerSALRaw,
    configuredSALToken,
    configuredCertificateSBT,
    ...chainChecks
  ] = await Promise.all([
    provider.getNetwork(),
    marketplace.certificateNonces(normalizedOwner),
    marketplace.metadataSigner(),
    marketplace.paused(),
    marketplace.blacklistedOwners(normalizedOwner),
    marketplace.MAX_RETIREMENT_PROJECTS(),
    marketplace.KG_CO2_PER_SAL(),
    marketplace.salToken(),
    marketplace.certificateSBT(),
    ...basket.projectIds.flatMap((id) => [
      marketplace.projects(id),
      salToken.balanceOf(normalizedOwner, id),
      salToken.projectBlacklist(id),
    ]),
  ]);

  if (configuredSigner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error('METADATA_SIGNER_PRIVATE_KEY không khớp metadataSigner của SALMarketplace');
  }
  if (lowerAddress(configuredSALToken) !== salContractAddress) {
    throw new Error('SAL_CONTRACT_ADDRESS không khớp SAL token được SALMarketplace cấu hình');
  }
  if (lowerAddress(configuredCertificateSBT) !== certificateContractAddress) {
    throw new Error('GREEN_CERTIFICATE_SBT_ADDRESS không khớp certificateSBT của SALMarketplace');
  }
  if (marketplacePaused) {
    throw new Error('SALMarketplace đang pause, chưa thể retire SAL');
  }
  if (ownerBlacklisted) {
    throw new Error('Ví đang bị blacklist trên SALMarketplace');
  }

  const onChainMaxProjects = Number(onChainMaxProjectsRaw);
  const kgCO2PerSAL = Number(onChainKgPerSALRaw);
  if (!Number.isSafeInteger(onChainMaxProjects) || onChainMaxProjects <= 0) {
    throw new Error('MAX_RETIREMENT_PROJECTS trên blockchain không hợp lệ');
  }
  if (basket.projectIds.length > onChainMaxProjects) {
    throw new Error(`Smart contract chỉ cho retire tối đa ${onChainMaxProjects} dự án`);
  }
  if (!Number.isSafeInteger(kgCO2PerSAL) || kgCO2PerSAL <= 0) {
    throw new Error('KG_CO2_PER_SAL trên blockchain không hợp lệ');
  }

  for (let index = 0; index < basket.projectIds.length; index += 1) {
    const onChainProject = chainChecks[index * 3];
    const ownerBalance = chainChecks[(index * 3) + 1];
    const tokenBlacklisted = chainChecks[(index * 3) + 2];

    if (!onChainProject.exists || !onChainProject.approved || onChainProject.blacklisted || onChainProject.cancelled) {
      throw new Error(`Dự án #${basket.projectIds[index]} trên blockchain không ở trạng thái có thể retire`);
    }
    if (tokenBlacklisted) {
      throw new Error(`SAL của dự án #${basket.projectIds[index]} đang bị blacklist`);
    }
    if (ownerBalance < BigInt(basket.salAmounts[index])) {
      throw new Error(`Ví không đủ SAL của dự án #${basket.projectIds[index]}`);
    }
  }

  const chainId = Number(network.chainId);
  if (chainId !== expectedChainId) {
    throw new Error(`CHAIN_ID (${expectedChainId}) không khớp RPC network (${chainId})`);
  }

  const nonce = Number(currentNonce);
  const nowUnix = Math.floor(Date.now() / 1000);
  const draftKey = `${chainId}:${marketplaceAddress}:${normalizedOwner}:${nonce}`;

  await expireStaleCertificateDrafts(nowUnix);

  const reusableDraft = await Certificate.findOne({
    draftKey,
    status: 'PENDING',
    retirementBasketKey: basket.retirementBasketKey,
    metadataDeadline: { $gt: nowUnix + 30 },
  }).sort({ createdAt: -1 });

  if (reusableDraft) {
    return reusableDraft;
  }

  // Một nonce chỉ có thể dùng cho một retirement. Draft cũ khác basket phải hết hiệu lực.
  await Certificate.updateMany(
    { draftKey, status: 'PENDING' },
    {
      $set: {
        status: 'EXPIRED',
        expiredAt: new Date(),
      },
    }
  );

  const metadataRequestId = crypto.randomUUID();
  const serial = `SALX-${basket.projectIds.length}P-${metadataRequestId.slice(0, 8).toUpperCase()}`;
  const preparedAt = new Date();

  const sources = orderedProjects.map((project, index) => ({
    projectId: basket.projectIds[index],
    projectName: project.projectName,
    retiredTokenAmount: basket.salAmounts[index],
    retiredCO2Kg: basket.salAmounts[index] * kgCO2PerSAL,
  }));

  const svg = buildCertificateSvg({
    sources,
    ownerAddress: normalizedOwner,
    retiredTokenAmount: basket.totalSALAmount,
    retiredCO2Kg: basket.totalSALAmount * kgCO2PerSAL,
    issuedAt: preparedAt,
    serial,
  });

  const image = await pinBufferToIPFS({
    buffer: Buffer.from(svg, 'utf8'),
    filename: `salx-certificate-${metadataRequestId}.svg`,
    contentType: 'image/svg+xml',
  });

  const preparedAtUnix = Math.floor(preparedAt.getTime() / 1000);
  const svgBase64 = Buffer.from(svg, 'utf8').toString('base64');

  // MetaMask requires a raster image (PNG) — it cannot render SVGs from any source
  // (IPFS, HTTPS, or data URIs) due to sandbox security restrictions. Convert SVG→PNG
  // using @resvg/resvg-js so the `image` field is always a valid PNG data URI.
  // Falls back to SVG data URI if the package is not installed.
  let imageDataUri;
  try {
    const { Resvg } = require('@resvg/resvg-js');
    const resvg = new Resvg(svg, { font: { loadSystemFonts: true } });
    const pngBuffer = resvg.render().asPng();
    imageDataUri = `data:image/png;base64,${pngBuffer.toString('base64')}`;
    console.log('[cert] SVG→PNG conversion successful for certificate image');
  } catch (resvgError) {
    console.warn('[cert] @resvg/resvg-js unavailable, falling back to SVG data URI:', resvgError.message);
    imageDataUri = `data:image/svg+xml;base64,${svgBase64}`;
  }

  const metadata = {
    name: `SALX Carbon Retirement Certificate - ${serial}`,
    description: `Soulbound certificate confirming the permanent retirement of ${basket.totalSALAmount * kgCO2PerSAL} kg CO2 from ${sources.length} verified SAL project source${sources.length > 1 ? 's' : ''}.`,
    image: imageDataUri,
    animation_url: image.uri,  // IPFS SVG URI for OpenSea / other indexers
    image_data: `data:image/svg+xml;base64,${svgBase64}`,
    background_color: '07150f',
    external_url: `${process.env.APP_URL || 'https://salx.app'}/dashboard?tab=certificates`,
    attributes: [
      { trait_type: 'Certificate Serial', value: serial },
      { trait_type: 'Certificate Type', value: 'Soulbound Carbon Retirement' },
      { trait_type: 'Project Count', value: sources.length, display_type: 'number' },
      { trait_type: 'Retired SAL Amount', value: basket.totalSALAmount, display_type: 'number' },
      { trait_type: 'Retired CO2 (kg)', value: basket.totalSALAmount * kgCO2PerSAL, display_type: 'number' },
      { trait_type: 'Certificate Owner', value: normalizedOwner },
      { trait_type: 'Prepared At', value: preparedAtUnix, display_type: 'date' },
      { trait_type: 'Transferability', value: 'Non-transferable' },
    ],
    properties: {
      schema: 'salx-certificate-v3-multiproject',
      metadata_request_id: metadataRequestId,
      owner: normalizedOwner,
      project_count: sources.length,
      project_ids: basket.projectIds,
      sal_amounts: basket.salAmounts,
      retired_sal_amount: basket.totalSALAmount,
      retired_co2_kg: basket.totalSALAmount * kgCO2PerSAL,
      kg_co2_per_sal: kgCO2PerSAL,
      sources: sources.map((source) => ({
        project_id: source.projectId,
        project_name: source.projectName,
        retired_sal_amount: source.retiredTokenAmount,
        retired_co2_kg: source.retiredCO2Kg,
      })),
      prepared_at: preparedAt.toISOString(),
    },
  };

  const pinnedMetadata = await pinJSONToIPFS(
    metadata,
    `salx-certificate-${metadataRequestId}.json`
  );

  const ttlSeconds = Math.max(60, Number(process.env.METADATA_SIGNATURE_TTL_SECONDS || 900));
  const deadline = Math.floor(Date.now() / 1000) + ttlSeconds;
  const uriHash = ethers.keccak256(ethers.toUtf8Bytes(pinnedMetadata.uri));

  const domain = {
    name: 'SALMarketplace',
    version: '1',
    chainId,
    verifyingContract: process.env.MARKETPLACE_CONTRACT_ADDRESS,
  };
  const types = {
    CertificateMetadata: [
      { name: 'retirer', type: 'address' },
      { name: 'projectIds', type: 'uint256[]' },
      { name: 'salAmounts', type: 'uint256[]' },
      { name: 'uriHash', type: 'bytes32' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  };
  const value = {
    retirer: normalizedOwner,
    projectIds: basket.projectIds.map((value_) => BigInt(value_)),
    salAmounts: basket.salAmounts.map((value_) => BigInt(value_)),
    uriHash,
    nonce: BigInt(nonce),
    deadline: BigInt(deadline),
  };
  const signature = await signer.signTypedData(domain, types, value);

  const legacyProjectId = sources.length === 1 ? sources[0].projectId : 0;
  const legacyProjectName = sources.length === 1
    ? sources[0].projectName
    : `${sources.length} source projects`;

  let draft;
  try {
    draft = await Certificate.create({
      draftKey,
      metadataRequestId,
      chainId,
      certificateContractAddress,
      ownerAddress: normalizedOwner,
      projectId: legacyProjectId,
      projectName: legacyProjectName,
      projectCount: sources.length,
      sources,
      retirementBasketKey: basket.retirementBasketKey,
      retiredTokenAmount: basket.totalSALAmount,
      retiredCO2Kg: basket.totalSALAmount * kgCO2PerSAL,
      certificateURI: pinnedMetadata.uri,
      metadataNonce: nonce,
      metadataDeadline: deadline,
      metadataSignature: signature,
      metadataSignerAddress: signer.address.toLowerCase(),
      metadataCID: pinnedMetadata.cid,
      imageURI: image.uri,
      metadata,
      status: 'PENDING',
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;

    // Hai request đồng thời có thể cùng đọc một nonce. Chỉ tái sử dụng draft
    // nếu basket hoàn toàn giống nhau; tuyệt đối không trả chữ ký của basket khác.
    draft = await Certificate.findOne({
      draftKey,
      status: 'PENDING',
      retirementBasketKey: basket.retirementBasketKey,
    });

    if (!draft) {
      throw new Error('Có request retirement khác đang dùng cùng nonce; vui lòng thử lại');
    }
  }

  return draft;
};

module.exports = {
  KG_CO2_PER_TOKEN,
  MAX_RETIREMENT_PROJECTS,
  normalizeRetirementBasket,
  createCertificateMetadata,
  expireStaleCertificateDrafts,
};
