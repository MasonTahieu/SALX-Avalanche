#!/usr/bin/env node
/*
 * Create the demo projects in scripts/demo-projects.js on the live Fuji
 * deployment, through the same path the app uses:
 *
 *   1. new owner wallet per project, funded from the platform owner wallet
 *   2. MRV summary PDF  -> POST /api/upload/ipfs           (live backend)
 *   3. project metadata -> POST /api/projects/metadata     (live backend)
 *   4. submitProject(projectURI, CO2 kg) + deposit          (project wallet)
 *   5. voteOnProject(id, true)                              (validator + owner wallets)
 *   6. approve & mint SAL -> PUT /api/projects/approve/:id  (live backend, admin key)
 *   7. createListing(id, amount, price)                     (project wallet)
 *
 * Usage (from backend/):
 *   node scripts/seed-demo-projects.js                 dry run: checks and costs, sends nothing
 *   node scripts/seed-demo-projects.js --execute       create every project
 *   node scripts/seed-demo-projects.js --execute --only=ngoc-hien-mangrove
 *
 * Keys come from backend/.env (ADMIN_PRIVATE_KEY = contract owner,
 * VALIDATOR_PRIVATE_KEY, ADMIN_SECRET_KEY). Progress and the generated project
 * wallets are saved in backend/.demo-seed/state.json (gitignored), so a failed
 * run can be re-run and continues where it stopped. Do not run a local backend
 * at the same time: the live Render backend indexes these transactions.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { ethers } = require('ethers');
const PROJECTS = require('./demo-projects');
const { buildProjectSubmissionMetadata } = require('../services/projectMetadataService');

const argv = process.argv.slice(2);
const EXECUTE = argv.includes('--execute');
const ONLY = (argv.find((arg) => arg.startsWith('--only=')) || '').slice('--only='.length) || null;

const API = (process.env.SEED_API_URL || 'https://salx-avalanche-api.onrender.com').replace(/\/$/, '');
const RPC = process.env.RPC_URL || 'https://avalanche-fuji-c-chain-rpc.publicnode.com';
const EXPLORER = (process.env.BLOCK_EXPLORER_URL || 'https://testnet.snowtrace.io').replace(/\/$/, '');
const CHAIN_ID = 43113n;
const KG_PER_SAL = 10;
// Gas for a project wallet's own transactions (submit, approval, listing).
// Fuji gas is far cheaper than this; the margin is for fee spikes.
const GAS_BUFFER = ethers.parseEther('0.002');

const STATE_DIR = path.join(__dirname, '..', '.demo-seed');
const STATE_FILE = path.join(STATE_DIR, 'state.json');
const PREVIEW_DIR = path.join(STATE_DIR, 'preview');

const loadAbi = (name) => {
  const json = require(path.join(__dirname, '..', 'abis', name));
  return json.abi || json;
};

const tx = (hash) => `${EXPLORER}/tx/${hash}`;
const addr = (address) => `${EXPLORER}/address/${address}`;
const avax = (wei) => `${ethers.formatEther(wei)} AVAX`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const step = (text) => console.log(`  • ${text}`);

// ---------------------------------------------------------------- state

const loadState = () => {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { wallets: {}, projects: {} };
  }
};

const saveState = (state) => {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const tmp = `${STATE_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_FILE);
};

// ---------------------------------------------------------------- live API

async function api(pathname, { method = 'GET', body, admin = false, timeoutMs = 120_000 } = {}) {
  const headers = {};
  if (admin) headers['x-admin-key'] = process.env.ADMIN_SECRET_KEY;
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const response = await fetch(`${API}${pathname}`, {
    method,
    headers,
    body: payload,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const detail = data?.error ? `${data.error}${data.details ? ` (${JSON.stringify(data.details).slice(0, 200)})` : ''}` : String(text).slice(0, 300);
    const error = new Error(`${method} ${pathname} -> HTTP ${response.status}: ${detail}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

async function waitFor(label, check, { timeoutMs = 300_000, everyMs = 8_000 } = {}) {
  const started = Date.now();
  for (;;) {
    const value = await check().catch(() => null);
    if (value) return value;
    if (Date.now() - started > timeoutMs) throw new Error(`Hết thời gian chờ: ${label}`);
    await sleep(everyMs);
  }
}

// ---------------------------------------------------------------- MRV PDF

// One-page PDF with the standard Helvetica fonts. PDF base fonts have no
// Vietnamese glyphs, so text is transliterated to ASCII (Ngọc Hiển -> Ngoc Hien).
const ascii = (text) => String(text)
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/đ/g, 'd')
  .replace(/Đ/g, 'D')
  .replace(/[^\x20-\x7E]/g, '-');

const wrap = (text, max) => {
  const lines = [];
  let line = '';
  for (const word of ascii(text).split(/\s+/)) {
    if (line && (line + ' ' + word).length > max) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
};

function buildMrvPdf(project, ownerAddress, preparedOn) {
  const lines = [];
  const add = (text, { font = 'F1', size = 10, gap = 0 } = {}) => lines.push({ text: ascii(text), font, size, gap });
  const sal = project.proposedCO2Kg / KG_PER_SAL;

  add('SALX CARBON PROJECT', { font: 'F2', size: 9 });
  add(project.mrv.title, { font: 'F2', size: 16, gap: 4 });
  add(project.projectName, { font: 'F2', size: 13, gap: 2 });
  add(`Location: ${project.location}`, { gap: 6 });
  add(`Project type: ${project.projectType}`);
  wrap(`Methodology: ${project.methodology}`, 92).forEach((text) => add(text));
  add(`Monitoring period: ${project.monitoringStart} to ${project.monitoringEnd}`);
  add(`Project owner wallet: ${ownerAddress}`);
  add(`Claimed: ${project.proposedCO2Kg.toLocaleString('en-US')} kg CO2e (${sal.toLocaleString('en-US')} SAL at ${KG_PER_SAL} kg per SAL)`);

  add('Key figures', { font: 'F2', size: 11, gap: 10 });
  for (const [label, value] of project.mrv.rows) {
    wrap(`${label}: ${value}`, 92).forEach((text) => add(text));
  }

  add('Method and evidence', { font: 'F2', size: 11, gap: 10 });
  for (const note of project.mrv.notes) {
    wrap(`- ${note}`, 92).forEach((text) => add(text));
  }

  add('Project summary', { font: 'F2', size: 11, gap: 10 });
  wrap(project.description, 92).forEach((text) => add(text));

  add(`Prepared ${preparedOn} for the SALX demo on Avalanche Fuji testnet. Figures are illustrative.`, { size: 8, gap: 14 });

  const escape = (text) => text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  let y = 800;
  let stream = '';
  for (const line of lines) {
    y -= line.gap;
    stream += `BT /${line.font} ${line.size} Tf 56 ${y.toFixed(1)} Td (${escape(line.text)}) Tj ET\n`;
    y -= line.size * 1.45;
  }
  if (y < 40) throw new Error(`MRV PDF for ${project.key} does not fit on one page`);

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}endstream`,
  ];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(out, 'latin1'));
    out += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

// ---------------------------------------------------------------- chain helpers

const findEvent = (contract, receipt, name) => {
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== contract.target.toLowerCase()) continue;
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed?.name === name) return parsed;
    } catch { /* another contract's event */ }
  }
  throw new Error(`Không thấy event ${name} trong giao dịch ${receipt.hash}`);
};

async function send(label, promise) {
  const sent = await promise;
  step(`${label}: ${tx(sent.hash)}`);
  const receipt = await sent.wait();
  if (receipt.status !== 1) throw new Error(`${label} thất bại: ${tx(sent.hash)}`);
  return receipt;
}

// ---------------------------------------------------------------- one project

async function seedProject(project, ctx) {
  const { state, provider, market, sal, owner, validator, feePerSAL } = ctx;
  const saved = (state.projects[project.key] ||= {});
  const salAmount = project.proposedCO2Kg / KG_PER_SAL;
  const deposit = BigInt(salAmount) * feePerSAL;

  console.log(`\n▶ ${project.projectName}`);

  // 1. Project owner wallet
  if (!state.wallets[project.key]) {
    const wallet = ethers.Wallet.createRandom();
    state.wallets[project.key] = { address: wallet.address, privateKey: wallet.privateKey };
    saveState(state);
  }
  const dev = new ethers.Wallet(state.wallets[project.key].privateKey, provider);
  step(`Ví chủ dự án: ${addr(dev.address)}`);

  // 2. Funding: deposit + gas before submitting, gas only afterwards
  const balance = await provider.getBalance(dev.address);
  const needed = saved.projectId ? GAS_BUFFER / 2n : deposit + GAS_BUFFER;
  if (balance < needed) {
    const topUp = (saved.projectId ? GAS_BUFFER : deposit + GAS_BUFFER) - balance;
    await send(`Nạp ${avax(topUp)} từ ví owner`, owner.sendTransaction({ to: dev.address, value: topUp }));
  }

  // 3. MRV document on IPFS
  if (!saved.document) {
    const pdf = buildMrvPdf(project, dev.address, new Date().toISOString().slice(0, 10));
    const filename = `${project.key}-mrv-period-1.pdf`;
    const form = new FormData();
    form.append('document', new Blob([pdf], { type: 'application/pdf' }), filename);
    const uploaded = await api('/api/upload/ipfs', { method: 'POST', body: form });
    saved.document = {
      name: filename,
      uri: `ipfs://${uploaded.ipfsHash}`,
      type: 'application/pdf',
      sha256: crypto.createHash('sha256').update(pdf).digest('hex'),
    };
    saveState(state);
    step(`Tài liệu MRV: ${saved.document.uri}`);
  }

  // 4. Project metadata on IPFS
  if (!saved.projectURI) {
    const response = await api('/api/projects/metadata', {
      method: 'POST',
      body: {
        projectName: project.projectName,
        description: project.description,
        ownerWallet: dev.address,
        proposedCO2Kg: project.proposedCO2Kg,
        projectType: project.projectType,
        location: project.location,
        methodology: project.methodology,
        monitoringStart: project.monitoringStart,
        monitoringEnd: project.monitoringEnd,
        documents: [saved.document],
      },
    });
    if (BigInt(response.nextAction.valueWei) !== deposit) {
      throw new Error(`Tiền cọc backend báo (${response.nextAction.valueWei}) khác contract (${deposit})`);
    }
    saved.projectURI = response.projectURI;
    saveState(state);
    step(`Metadata dự án: ${saved.projectURI}`);
  }

  // 5. Submit on-chain
  if (!saved.projectId) {
    const receipt = await send(
      `submitProject (cọc ${avax(deposit)})`,
      market.connect(dev).submitProject(saved.projectURI, project.proposedCO2Kg, { value: deposit }),
    );
    saved.submitTx = receipt.hash;
    saved.projectId = Number(findEvent(market, receipt, 'ProjectSubmitted').args.projectId);
    saveState(state);
    step(`Dự án on-chain #${saved.projectId}`);
  }
  const projectId = saved.projectId;

  // 6. Validator votes until the frozen quorum is reached
  let onChain = await market.projects(projectId);
  if (!onChain.approved) {
    const quorum = await market.projectApprovalQuorum(projectId);
    for (const [label, wallet] of [['validator', validator], ['owner', owner]]) {
      if ((await market.listingApprovalVotes(projectId)) >= quorum) break;
      const eligible = await market.projectValidatorEligible(projectId, wallet.address);
      const voted = await market.hasVotedOnProject(projectId, wallet.address);
      if (!eligible || voted) continue;
      const receipt = await send(`Vote duyệt (${label})`, market.connect(wallet).voteOnProject(projectId, true));
      (saved.votes ||= {})[label] = receipt.hash;
      saveState(state);
    }
    const votes = await market.listingApprovalVotes(projectId);
    if (votes < quorum) throw new Error(`Chưa đủ quorum (${votes}/${quorum}) cho dự án #${projectId}`);
  }

  // 7. Approve and mint SAL through the backend (it writes the SAL token metadata)
  onChain = await market.projects(projectId);
  if (!onChain.approved) {
    step('Chờ indexer của backend ghi nhận dự án…');
    const indexed = await waitFor(`indexer ghi nhận dự án #${projectId}`, async () => {
      const pending = await api('/api/projects/pending', { admin: true });
      return pending.find((row) => Number(row.onChainProjectId) === projectId);
    });
    const response = await api(`/api/projects/approve/${indexed._id}`, {
      method: 'PUT',
      admin: true,
      timeoutMs: 180_000,
      body: { approvedCO2Kg: project.proposedCO2Kg, onChainProjectId: projectId },
    });
    saved.approveTx = response.txHash;
    saveState(state);
    step(`Duyệt + mint ${salAmount} SAL: ${tx(response.txHash)}`);
  }
  await waitFor(`SAL #${projectId} về ví chủ dự án`, async () => (await sal.balanceOf(dev.address, projectId)) > 0n || saved.listingId, { timeoutMs: 120_000, everyMs: 4_000 });

  // 8. List part of the SAL for sale
  if (!saved.listingId) {
    if (!(await sal.isApprovedForAll(dev.address, market.target))) {
      await send('Cho phép marketplace giữ SAL (setApprovalForAll)', sal.connect(dev).setApprovalForAll(market.target, true));
    }
    const price = ethers.parseEther(project.listing.priceAvax);
    const receipt = await send(
      `Niêm yết ${project.listing.amount} SAL @ ${project.listing.priceAvax} AVAX`,
      market.connect(dev).createListing(projectId, project.listing.amount, price),
    );
    saved.listingTx = receipt.hash;
    saved.listingId = Number(findEvent(market, receipt, 'ListingCreated').args.listingId);
    saveState(state);
  }

  // 9. Visible in the app once the indexer has it
  await waitFor(`listing #${saved.listingId} hiện trên API`, async () => {
    const listings = await api('/api/listings?active=true');
    return listings.some((row) => Number(row.listingId) === saved.listingId);
  }, { timeoutMs: 180_000 });
  step(`Đã lên Marketplace: listing #${saved.listingId}`);
}

// ---------------------------------------------------------------- main

async function main() {
  console.log(`SALX demo seed — ${EXECUTE ? 'CHẠY THẬT (gửi giao dịch)' : 'DRY RUN (không gửi gì)'}`);
  console.log(`API: ${API}\nRPC: ${RPC}\n`);

  const missing = ['ADMIN_PRIVATE_KEY', 'VALIDATOR_PRIVATE_KEY', 'ADMIN_SECRET_KEY', 'MARKETPLACE_CONTRACT_ADDRESS', 'SAL_CONTRACT_ADDRESS']
    .filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`Thiếu biến trong backend/.env: ${missing.join(', ')}`);

  const projects = PROJECTS.filter((project) => !ONLY || project.key === ONLY);
  if (!projects.length) throw new Error(`Không có dự án nào khớp --only=${ONLY}`);

  const provider = new ethers.JsonRpcProvider(RPC);
  const { chainId } = await provider.getNetwork();
  if (chainId !== CHAIN_ID) throw new Error(`RPC đang ở chain ${chainId}, cần Fuji (43113)`);

  const owner = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY, provider);
  const validator = new ethers.Wallet(process.env.VALIDATOR_PRIVATE_KEY, provider);
  const market = new ethers.Contract(process.env.MARKETPLACE_CONTRACT_ADDRESS, loadAbi('SALMarketplace.json'), provider);
  const sal = new ethers.Contract(process.env.SAL_CONTRACT_ADDRESS, loadAbi('SAL1155.json'), provider);

  // Preconditions
  const checks = [];
  const check = (ok, label) => { checks.push([ok, label]); console.log(`${ok ? '✓' : '✗'} ${label}`); };
  check((await market.owner()).toLowerCase() === owner.address.toLowerCase(), `ADMIN_PRIVATE_KEY là owner của Marketplace (${owner.address})`);
  check(await market.isValidator(validator.address), `VALIDATOR_PRIVATE_KEY là validator (${validator.address})`);
  check(await market.isValidator(owner.address), 'Ví owner cũng là validator (cần cho quorum 2/2)');
  check(!(await market.paused()), 'Marketplace không bị pause');
  const live = await api('/api/health/live', { timeoutMs: 120_000 }).catch((error) => ({ error: error.message }));
  check(live?.status === 'ok', `Backend live trả lời (${live?.error || `uptime ${live?.uptimeSeconds}s`})`);
  const adminOk = await api('/api/projects/pending', { admin: true }).then(() => true).catch(() => false);
  check(adminOk, 'ADMIN_SECRET_KEY khớp với backend trên Render');

  const feePerSAL = await market.salTokenizationFeePerSAL();
  const minPrice = await market.minPrice();
  const state = loadState();

  // Validate every project and work out the funding it needs
  let funding = 0n;
  const rows = [];
  for (const project of projects) {
    const salAmount = project.proposedCO2Kg / KG_PER_SAL;
    buildProjectSubmissionMetadata({
      ...project,
      ownerWallet: ethers.ZeroAddress.replace(/0$/, '1'),
      documents: [{ name: 'mrv.pdf', uri: 'ipfs://bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy', type: 'application/pdf' }],
    });
    if (!Number.isInteger(salAmount)) throw new Error(`${project.key}: proposedCO2Kg phải chia hết cho 10`);
    if (project.listing.amount > salAmount) throw new Error(`${project.key}: niêm yết nhiều hơn số SAL được mint`);
    if (ethers.parseEther(project.listing.priceAvax) < minPrice) throw new Error(`${project.key}: giá thấp hơn minPrice ${ethers.formatEther(minPrice)} AVAX`);

    const deposit = BigInt(salAmount) * feePerSAL;
    const saved = state.projects[project.key] || {};
    const wallet = state.wallets[project.key];
    const balance = wallet ? await provider.getBalance(wallet.address) : 0n;
    const needed = saved.projectId ? 0n : deposit + GAS_BUFFER;
    if (balance < needed) funding += needed - balance;
    rows.push({
      project: project.projectName,
      CO2: `${project.proposedCO2Kg.toLocaleString('en-US')} kg`,
      SAL: salAmount,
      deposit: ethers.formatEther(deposit),
      listing: `${project.listing.amount} @ ${project.listing.priceAvax}`,
      status: saved.listingId ? `xong (listing #${saved.listingId})` : saved.projectId ? `dở (dự án #${saved.projectId})` : 'mới',
    });

    // Preview the MRV PDF locally (also in dry run)
    fs.mkdirSync(PREVIEW_DIR, { recursive: true });
    fs.writeFileSync(path.join(PREVIEW_DIR, `${project.key}-mrv-period-1.pdf`), buildMrvPdf(project, wallet?.address || '(new wallet, created on --execute)', new Date().toISOString().slice(0, 10)));
  }

  const ownerBalance = await provider.getBalance(owner.address);
  check(ownerBalance >= funding, `Ví owner đủ AVAX để nạp cho ví dự án (cần ~${avax(funding)}, đang có ${avax(ownerBalance)})`);

  // Simulate a submission from a fresh wallet (eth_call, nothing is sent)
  const probe = ethers.Wallet.createRandom().address;
  const sample = projects[0];
  const sampleDeposit = BigInt(sample.proposedCO2Kg / KG_PER_SAL) * feePerSAL;
  const simulated = await provider.send('eth_call', [
    {
      from: probe,
      to: market.target,
      data: market.interface.encodeFunctionData('submitProject', ['ipfs://bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy', sample.proposedCO2Kg]),
      value: ethers.toQuantity(sampleDeposit),
    },
    'latest',
    { [probe]: { balance: ethers.toQuantity(ethers.parseEther('1')) } },
  ]).then(() => true).catch((error) => { console.log(`   ${error.shortMessage || error.message}`); return false; });
  check(simulated, `Mô phỏng submitProject từ một ví mới thành công (${sample.projectName})`);

  console.log('\nKế hoạch:');
  console.table(rows);
  console.log(`Bản xem trước tài liệu MRV: ${PREVIEW_DIR}`);

  if (checks.some(([ok]) => !ok)) throw new Error('Còn điều kiện chưa đạt (✗) ở trên, chưa thể chạy.');
  if (!EXECUTE) {
    console.log('\nDry run xong, chưa gửi giao dịch nào. Chạy thật: node scripts/seed-demo-projects.js --execute');
    return;
  }

  const ctx = { state, provider, market, sal, owner, validator, feePerSAL };
  for (const project of projects) {
    await seedProject(project, ctx);
  }

  console.log('\n✓ Xong. Mở https://salx-avalanche.vercel.app/marketplace để xem.');
  console.log(`Tiến trình + ví dự án lưu ở ${STATE_FILE} (đừng commit file này).`);
}

main().catch((error) => {
  console.error(`\n✗ ${error.message}`);
  console.error('Có thể chạy lại cùng lệnh: script tiếp tục từ bước đã dừng.');
  process.exit(1);
});
