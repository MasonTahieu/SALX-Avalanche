const assert = require('assert');
const {
  ARTWORK_VERSION,
  buildCertificateSvg,
  renderCertificatePng,
  isCurrentArtwork,
  artworkInputFromCertificate,
  formatTonnes,
} = require('../services/certificateArtwork');

const pngWidth = (buffer) => buffer.readUInt32BE(16);
const isPng = (buffer) => buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

// Tonnes never collapse to "0.0" and round half up.
assert.equal(formatTonnes(30), '0.03');
assert.equal(formatTonnes(150), '0.15');
assert.equal(formatTonnes(5), '0.005');
assert.equal(formatTonnes(1200), '1.2');
assert.equal(formatTonnes(12450), '12.5');

const owner = '0xa5ebb67ab447f9285ecf024cc4f3f91afc449afc';
const single = buildCertificateSvg({
  sources: [{ projectId: 1, projectName: 'E2E Test - Can Gio Mangrove', retiredTokenAmount: 3, retiredCO2Kg: 30 }],
  ownerAddress: owner,
  retiredTokenAmount: 3,
  retiredCO2Kg: 30,
  issuedAt: new Date(1793806068 * 1000),
  serial: 'SALX-1P-66430154',
});

// Every piece of information the previous certificate artwork carried.
const required = [
  ARTWORK_VERSION,
  'Carbon Retirement Certificate',
  'SBT · SALX-1P-66430154',
  'This certificate is proof that',
  '>30<',
  'kg CO₂e',
  '(0.03 tonnes) credits have been permanently retired',
  'We are hereby permanently retiring',
  '30 kg CO₂ equivalent (3 SAL)',
  'on behalf of',
  '0xa5ebb6...449afc',
  'CREDIT CATEGORY', 'Carbon Credits',
  'CARBON STANDARD', 'SALX Standard',
  'VINTAGE', '2026',
  'ISSUER', 'SALX',
  'SAL RETIRED', '3 SAL',
  'PROJECTS',
  'ISSUED ON', '04 Nov 2026',
  'BENEFICIARY',
  'E2E Test - Can Gio Mangrove',
  'by SALX',
  'This certificate guarantees the permanent, on-chain retirement of carbon credits registered in the SALX marketplace.',
  'Verification is permanently recorded on the Avalanche blockchain.',
  'salx.app',
];
for (const text of required) {
  assert.ok(single.includes(text), `certificate SVG is missing: ${text}`);
}
assert.ok(!single.includes('NaN') && !single.includes('undefined'), 'certificate SVG has unresolved values');
assert.ok(isCurrentArtwork(single));
assert.equal(isCurrentArtwork('<svg><text>Carbon Retirement Certificate</text></svg>'), false);

// A stored certificate minted with the old artwork (shape of certificate #1 on Fuji)
// is redrawn from its own data: same serial, basket, owner and prepared date.
const storedLegacy = {
  certificateTokenId: 1,
  ownerAddress: owner,
  retiredTokenAmount: 3,
  retiredCO2Kg: 30,
  mintedAt: '2026-11-04T15:28:02.000Z',
  metadataRequestId: '66430154-6790-4a14-bf65-700ab9e1287a',
  sources: [{ projectId: 1, projectName: 'E2E Test - Can Gio Mangrove', retiredTokenAmount: 3, retiredCO2Kg: 30 }],
  metadata: {
    attributes: [{ trait_type: 'Certificate Serial', value: 'SALX-1P-66430154' }],
    properties: { prepared_at: new Date(1793806068 * 1000).toISOString() },
  },
};
assert.equal(buildCertificateSvg(artworkInputFromCertificate(storedLegacy)), single, 'redrawn legacy certificate matches');
// Without a serial attribute, the serial is derived exactly as at mint time.
const noSerial = { ...storedLegacy, metadata: { properties: storedLegacy.metadata.properties } };
assert.equal(artworkInputFromCertificate(noSerial).serial, 'SALX-1P-66430154');
assert.equal(artworkInputFromCertificate({ ...storedLegacy, ownerAddress: null }), null);

// Five-project basket with a long name and a large total still lists every source.
const sources = [
  ['Can Gio Mangrove Restoration', 500],
  ['Bac Lieu Coastal Wind Power Phase II Expansion Project', 300],
  ['Binh Duong Rooftop Solar', 245],
  ['U Minh Ha Peatland Protection', 150],
  ['Ta Xua Cookstove Program', 50],
].map(([projectName, sal], index) => ({ projectId: index + 1, projectName, retiredTokenAmount: sal, retiredCO2Kg: sal * 10 }));
const basket = buildCertificateSvg({
  sources,
  ownerAddress: '0x9a19b5050dbbaabd856f1d81972a240fdc8d5bf5',
  retiredTokenAmount: 1245,
  retiredCO2Kg: 12450,
  issuedAt: new Date('2026-11-18T03:00:00Z'),
  serial: 'SALX-5P-9F2C41D7',
});
for (const id of ['#001', '#002', '#003', '#004', '#005']) assert.ok(basket.includes(id), `missing project row ${id}`);
assert.ok(basket.includes('Bac Lieu Coastal Wind Power Phase II Expansio…'), 'long project names are truncated');
assert.ok(basket.includes('12,450 kg CO₂ equivalent (1,245 SAL)'));
assert.ok(basket.includes('(12.5 tonnes)'));
assert.ok(basket.includes('SOURCE PROJECTS · 5'));

// Rasterisation with the bundled fonts at mint size and download size.
const minted = renderCertificatePng(single);
assert.ok(minted && isPng(minted), 'mint PNG rendered');
assert.equal(pngWidth(minted), 1000);
const download = renderCertificatePng(basket, { width: 2000 });
assert.ok(download && isPng(download), 'download PNG rendered');
assert.equal(pngWidth(download), 2000);

console.log('✅ Certificate artwork tests passed');
