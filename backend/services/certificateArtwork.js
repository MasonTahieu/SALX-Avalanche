// Artwork for the Green Certificate SBT: a 1000×1000 paper certificate drawn as
// SVG and rasterised with resvg using the bundled IBM Plex fonts, so the PNG is
// identical on every machine (Render has none of these fonts installed).
const fs = require('fs');
const path = require('path');

const ARTWORK_VERSION = 'salx-certificate-artwork:v4';
const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const FONTS_DIR = path.join(ASSETS_DIR, 'fonts');
const LOGO_PATH = path.join(ASSETS_DIR, 'salx-logo.png');

const SIZE = 1000;
const MARGIN = 76;
const RIGHT = SIZE - MARGIN;

const COLORS = {
  paper: '#f8f6f0',
  ink: '#12211a',
  muted: '#56655d',
  faint: '#66746c',
  green: '#0f7a0b',
  art: '#138f0e',
  accent: '#9a6a1f',
  frame: 'rgba(18,33,26,.55)',
  rule: 'rgba(18,33,26,.22)',
  ruleSoft: 'rgba(18,33,26,.11)',
};

// Fallbacks only matter when the SVG is opened in a browser (IPFS animation_url);
// the server rasterises with the bundled files.
const SERIF = "'IBM Plex Serif', Georgia, serif";
const SANS = "'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif";
const MONO = "'IBM Plex Mono', Menlo, Consolas, monospace";

const escapeXml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const shortenAddress = (address) => `${address.slice(0, 8)}...${address.slice(-6)}`;
const padId = (value) => String(value).padStart(3, '0');
const truncate = (value, max) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);

const roundTo = (value, digits) => (Math.round(value * 10 ** digits) / 10 ** digits).toFixed(digits);
// Enough precision that small retirements never read "0.0 tonnes".
const formatTonnes = (kg) => {
  const tonnes = kg / 1000;
  if (tonnes >= 1) return roundTo(tonnes, 1);
  if (tonnes >= 0.1) return roundTo(tonnes, 2);
  return roundTo(tonnes, 3).replace(/0+$/, '');
};

let resvgModule;
const loadResvg = () => {
  if (resvgModule === undefined) {
    try {
      resvgModule = require('@resvg/resvg-js');
    } catch (error) {
      console.warn('[cert] @resvg/resvg-js unavailable:', error.message);
      resvgModule = null;
    }
  }
  return resvgModule;
};

let fontOptions;
const getFontOptions = () => {
  if (!fontOptions) {
    let fontFiles = [];
    try {
      fontFiles = fs.readdirSync(FONTS_DIR)
        .filter((file) => file.endsWith('.ttf'))
        .map((file) => path.join(FONTS_DIR, file));
    } catch (error) {
      console.warn('[cert] bundled fonts missing, falling back to system fonts:', error.message);
    }
    fontOptions = fontFiles.length
      ? { fontFiles, loadSystemFonts: false, defaultFontFamily: 'IBM Plex Sans' }
      : { loadSystemFonts: true };
  }
  return fontOptions;
};

let logoDataUri;
const getLogoDataUri = () => {
  if (logoDataUri === undefined) {
    try {
      logoDataUri = `data:image/png;base64,${fs.readFileSync(LOGO_PATH).toString('base64')}`;
    } catch (error) {
      console.warn('[cert] logo missing:', error.message);
      logoDataUri = null;
    }
  }
  return logoDataUri;
};

// Right edge of a text fragment as rendered, or null when resvg is unavailable.
const measureRightEdge = (fragment) => {
  const resvg = loadResvg();
  if (!resvg) return null;
  try {
    const probe = new resvg.Resvg(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE * 2}" height="${SIZE}">${fragment}</svg>`,
      { font: getFontOptions() },
    );
    const box = probe.getBBox();
    return box ? box.x + box.width : null;
  } catch (error) {
    console.warn('[cert] text measurement failed, using estimate:', error.message);
    return null;
  }
};

// Deterministic PRNG so each certificate's contour pattern follows from its serial.
const seededRandom = (seed) => {
  let hash = 2166136261;
  for (const char of String(seed)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return () => {
    hash ^= hash << 13;
    hash ^= hash >>> 17;
    hash ^= hash << 5;
    return ((hash >>> 0) % 100000) / 100000;
  };
};

// 240 segments per ring keeps curves smooth at 2000 px while keeping the SVG small.
const CONTOUR_STEPS = 240;

const contourPaths = (seed, cx, cy, count, step) => {
  const random = seededRandom(seed);
  const waves = Array.from({ length: 5 }, () => ({
    n: 2 + Math.floor(random() * 5),
    amplitude: 0.04 + random() * 0.09,
    phase: random() * Math.PI * 2,
  }));
  let paths = '';
  for (let ring = 1; ring <= count; ring += 1) {
    let d = '';
    for (let i = 0; i <= CONTOUR_STEPS; i += 1) {
      const t = (i / CONTOUR_STEPS) * Math.PI * 2;
      const wobble = waves.reduce((sum, w) => sum + w.amplitude * Math.sin(w.n * t + w.phase + ring * 0.12), 0);
      const r = step * ring * (1 + wobble);
      d += `${i ? 'L' : 'M'}${(cx + r * Math.cos(t)).toFixed(1)},${(cy + r * Math.sin(t) * 0.8).toFixed(1)}`;
    }
    const major = ring % 5 === 0;
    paths += `<path d="${d}Z" fill="none" stroke="${COLORS.art}" stroke-width="${major ? 1.1 : 0.6}" opacity="${major ? 0.42 : 0.2}"/>`;
  }
  return paths;
};

const buildCertificateSvg = ({ sources, ownerAddress, retiredTokenAmount, retiredCO2Kg, issuedAt, serial }) => {
  const dateStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(issuedAt);
  const co2Fmt = retiredCO2Kg.toLocaleString('en-US');
  const salFmt = retiredTokenAmount.toLocaleString('en-US');
  const shortOwner = shortenAddress(ownerAddress);
  const vintage = String(issuedAt.getFullYear());
  const count = sources.length;

  // ── Vertical layout, built bottom-up so the hero takes whatever space is left ──
  const FOOT_BASE = SIZE - 74;
  const META_ROW = 60;
  const META_BOTTOM = FOOT_BASE - 50;
  const META_TOP = META_BOTTOM - 2 * META_ROW;
  const PROJECT_ROW = 34;
  const LIST_BOTTOM = META_TOP - 38;
  const LIST_TOP = LIST_BOTTOM - count * PROJECT_ROW;
  const LIST_HEAD = LIST_TOP - 13;
  const STATEMENT = LIST_HEAD - 44;
  const HERO_RULE = STATEMENT - 42;
  const HERO_TOP = 150;
  const HERO_BOTTOM = HERO_RULE - 30;

  // ── Hero: proof line, amount + unit on one baseline, tonnes line ──
  const heroHeight = HERO_BOTTOM - HERO_TOP;
  const sizeByWidth = (RIGHT - MARGIN - 190) / (co2Fmt.length * 0.6);
  const sizeByHeight = (heroHeight - 120) / 0.7;
  const numberSize = Math.round(Math.min(230, sizeByWidth, sizeByHeight));
  // Thousands separators descend below the baseline; leave room for them.
  const belowNumber = co2Fmt.includes(',') ? Math.max(46, numberSize * 0.2 + 28) : 46;
  const blockHeight = 24 + 26 + numberSize * 0.7 + belowNumber + 6;
  const blockTop = HERO_TOP + (heroHeight - blockHeight) / 2;
  const PROOF = Math.round(blockTop + 20);
  const NUMBER = Math.round(PROOF + 26 + numberSize * 0.7);
  const TONNES = Math.round(NUMBER + belowNumber);

  const numberX = Math.round(MARGIN - numberSize * 0.04);
  const numberText = `<text x="${numberX}" y="${NUMBER}" font-family="${SERIF}" font-weight="300" font-size="${numberSize}" letter-spacing="${(-numberSize * 0.015).toFixed(1)}" fill="${COLORS.ink}">${co2Fmt}</text>`;
  const numberRight = measureRightEdge(numberText) ?? numberX + co2Fmt.length * numberSize * 0.58;
  const unitX = Math.round(numberRight + numberSize * 0.06);
  const unitSize = Math.round(Math.max(36, numberSize * 0.19));

  // ── Statement: shrink until it fits between the margins ──
  const statementAt = (fontSize) => `<text x="${MARGIN}" y="${STATEMENT}" font-family="${SERIF}" font-size="${fontSize}" fill="${COLORS.ink}">We are hereby permanently retiring <tspan fill="${COLORS.green}" font-weight="500">${co2Fmt} kg CO₂ equivalent (${salFmt} SAL)</tspan> on behalf of <tspan font-family="${MONO}" font-size="${(fontSize * 0.86).toFixed(1)}">${escapeXml(shortOwner)}</tspan></text>`;
  let statementSize = 17.5;
  const statementRight = measureRightEdge(statementAt(statementSize));
  if (statementRight && statementRight > RIGHT) {
    const scaled = statementSize * ((RIGHT - MARGIN) / (statementRight - MARGIN));
    statementSize = Math.max(14, Math.floor(scaled * 2) / 2);
  }

  // ── Source projects (1–5 rows) ──
  const projectRows = sources.map((source, index) => {
    const rowTop = LIST_TOP + index * PROJECT_ROW;
    const base = rowTop + 23;
    const name = escapeXml(truncate(source.projectName || `Project #${source.projectId}`, 46));
    const sal = Number(source.retiredTokenAmount).toLocaleString('en-US');
    const kg = Number(source.retiredCO2Kg).toLocaleString('en-US');
    return [
      `<line x1="${MARGIN}" y1="${rowTop}" x2="${RIGHT}" y2="${rowTop}" stroke="${COLORS.ruleSoft}"/>`,
      `<text x="${MARGIN}" y="${base}" font-family="${MONO}" font-size="13.5" fill="${COLORS.faint}">#${padId(source.projectId)}</text>`,
      `<text x="${MARGIN + 56}" y="${base}" font-family="${SANS}" font-size="17" fill="${COLORS.ink}">${name}<tspan dx="8" fill="${COLORS.muted}" font-size="14.5">by SALX</tspan></text>`,
      `<text x="${RIGHT}" y="${base}" font-family="${MONO}" font-size="14.5" fill="${COLORS.ink}" text-anchor="end">${sal} SAL · ${kg} kg</text>`,
    ].join('\n  ');
  }).join('\n  ');

  // ── Metadata: every attribute the previous certificate showed, once each ──
  const cells = [
    ['CREDIT CATEGORY', 'Carbon Credits'],
    ['CARBON STANDARD', 'SALX Standard'],
    ['VINTAGE', vintage],
    ['ISSUER', 'SALX'],
    ['SAL RETIRED', `${salFmt} SAL`],
    ['PROJECTS', String(count)],
    ['ISSUED ON', dateStr],
    ['BENEFICIARY', shortOwner],
  ];
  const columnWidth = (RIGHT - MARGIN) / 4;
  const metaCells = cells.map(([label, value], index) => {
    const column = index % 4;
    const x = MARGIN + column * columnWidth + (column ? 16 : 0);
    const y = META_TOP + Math.floor(index / 4) * META_ROW;
    const mono = label === 'BENEFICIARY';
    return [
      `<text x="${x}" y="${y + 22}" font-family="${SANS}" font-weight="500" font-size="10.5" letter-spacing="1.4" fill="${COLORS.faint}">${label}</text>`,
      `<text x="${x}" y="${y + 46}" font-family="${mono ? MONO : SANS}" font-size="${mono ? 14.5 : 16.5}" fill="${COLORS.ink}">${escapeXml(value)}</text>`,
    ].join('\n  ');
  }).join('\n  ');
  const metaRules = [
    ...[META_TOP, META_TOP + META_ROW, META_BOTTOM].map((y, i) => `<line x1="${MARGIN}" y1="${y}" x2="${RIGHT}" y2="${y}" stroke="${i === 1 ? COLORS.ruleSoft : COLORS.rule}"/>`),
    ...[1, 2, 3].map((c) => `<line x1="${MARGIN + c * columnWidth}" y1="${META_TOP + 12}" x2="${MARGIN + c * columnWidth}" y2="${META_BOTTOM - 12}" stroke="${COLORS.ruleSoft}"/>`),
  ].join('\n  ');

  const logo = getLogoDataUri();
  const artCx = 742;
  const artCy = (HERO_TOP + HERO_RULE) / 2 - 10;

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- ${ARTWORK_VERSION} -->
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <clipPath id="art"><rect x="35" y="35" width="${SIZE - 70}" height="${HERO_RULE - 35}"/></clipPath>
    <linearGradient id="fadeLeft" x1="0" x2="1"><stop offset="0" stop-color="${COLORS.paper}" stop-opacity="0.95"/><stop offset="0.56" stop-color="${COLORS.paper}" stop-opacity="0"/></linearGradient>
    <linearGradient id="fadeBottom" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${COLORS.paper}" stop-opacity="0"/><stop offset="1" stop-color="${COLORS.paper}" stop-opacity="1"/></linearGradient>
  </defs>

  <!-- Paper and serial-seeded contour pattern -->
  <rect width="${SIZE}" height="${SIZE}" fill="${COLORS.paper}"/>
  <g clip-path="url(#art)">${contourPaths(serial, artCx, artCy, 30, (HERO_RULE - 40) / 50)}</g>
  <rect x="30" y="30" width="${SIZE - 60}" height="${HERO_RULE - 30}" fill="url(#fadeLeft)"/>
  <rect x="30" y="${HERO_RULE - 130}" width="${SIZE - 60}" height="131" fill="url(#fadeBottom)"/>

  <!-- Frame -->
  <rect x="26" y="26" width="${SIZE - 52}" height="${SIZE - 52}" fill="none" stroke="${COLORS.frame}" stroke-width="1.4"/>
  <rect x="34" y="34" width="${SIZE - 68}" height="${SIZE - 68}" fill="none" stroke="${COLORS.frame}" stroke-width="0.5"/>

  <!-- Header -->
  ${logo ? `<image href="${logo}" x="${MARGIN}" y="66" width="48" height="43" preserveAspectRatio="xMidYMid meet"/>` : ''}
  <text x="${MARGIN + 64}" y="87" font-family="${SERIF}" font-weight="500" font-size="25" fill="${COLORS.ink}">Carbon Retirement Certificate</text>
  <text x="${MARGIN + 64}" y="110" font-family="${MONO}" font-size="12.5" letter-spacing="1.4" fill="${COLORS.faint}">SBT · ${escapeXml(serial)}</text>
  <text x="${RIGHT}" y="87" font-family="${SANS}" font-weight="500" font-size="11.5" letter-spacing="2.6" fill="${COLORS.accent}" text-anchor="end">SOULBOUND · ${vintage}</text>

  <!-- Hero -->
  <text x="${MARGIN}" y="${PROOF}" font-family="${SERIF}" font-size="20" fill="${COLORS.muted}">This certificate is proof that</text>
  ${numberText}
  <text x="${unitX}" y="${NUMBER}" font-family="${SERIF}" font-size="${unitSize}" fill="${COLORS.green}">kg CO₂e</text>
  <text x="${MARGIN}" y="${TONNES}" font-family="${SERIF}" font-size="18.5" fill="${COLORS.muted}">(${formatTonnes(retiredCO2Kg)} tonnes) credits have been permanently retired</text>
  <line x1="${MARGIN}" y1="${HERO_RULE}" x2="${RIGHT}" y2="${HERO_RULE}" stroke="${COLORS.rule}"/>

  <!-- Statement -->
  ${statementAt(statementSize)}

  <!-- Source projects -->
  <text x="${MARGIN}" y="${LIST_HEAD}" font-family="${SANS}" font-weight="500" font-size="10.5" letter-spacing="1.4" fill="${COLORS.faint}">SOURCE PROJECT${count > 1 ? 'S' : ''} · ${count}</text>
  <text x="${RIGHT}" y="${LIST_HEAD}" font-family="${SANS}" font-weight="500" font-size="10.5" letter-spacing="1.4" fill="${COLORS.faint}" text-anchor="end">RETIRED</text>
  ${projectRows}
  <line x1="${MARGIN}" y1="${LIST_BOTTOM}" x2="${RIGHT}" y2="${LIST_BOTTOM}" stroke="${COLORS.ruleSoft}"/>

  <!-- Metadata -->
  ${metaRules}
  ${metaCells}

  <!-- Footer -->
  <text x="${MARGIN}" y="${FOOT_BASE - 19}" font-family="${SANS}" font-size="12" fill="${COLORS.muted}">This certificate guarantees the permanent, on-chain retirement of carbon credits registered in the SALX marketplace.</text>
  <text x="${MARGIN}" y="${FOOT_BASE}" font-family="${SANS}" font-size="12" fill="${COLORS.muted}">Verification is permanently recorded on the Avalanche blockchain.</text>
  <text x="${RIGHT}" y="${FOOT_BASE}" font-family="${SANS}" font-weight="500" font-size="15" fill="${COLORS.green}" text-anchor="end">salx.app</text>
</svg>`;
};

const isCurrentArtwork = (svg) => typeof svg === 'string' && svg.includes(ARTWORK_VERSION);

// Rasterise certificate SVG to PNG at the given pixel width; null if resvg is missing.
const renderCertificatePng = (svg, { width = SIZE } = {}) => {
  const resvg = loadResvg();
  if (!resvg) return null;
  return new resvg.Resvg(svg, {
    font: getFontOptions(),
    fitTo: { mode: 'width', value: width },
  }).render().asPng();
};

module.exports = {
  ARTWORK_VERSION,
  PAPER_COLOR: COLORS.paper,
  buildCertificateSvg,
  renderCertificatePng,
  isCurrentArtwork,
  formatTonnes,
};
