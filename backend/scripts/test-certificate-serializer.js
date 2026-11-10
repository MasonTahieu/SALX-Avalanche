const assert = require('assert');
const { EMBEDDED_IMAGE_PROJECTION, serializeCertificate } = require('../services/certificateSerializer');

const png = `data:image/png;base64,${'A'.repeat(4000)}`;
const svg = `data:image/svg+xml;base64,${'B'.repeat(4000)}`;

const stored = {
  certificateTokenId: 2,
  ownerAddress: '0xowner',
  projectId: 1,
  projectName: 'E2E Test - Can Gio Mangrove',
  retiredTokenAmount: 1,
  retiredCO2Kg: 10,
  certificateURI: 'ipfs://QmCert',
  imageURI: png,
  txHash: '0xabc',
  metadata: {
    name: 'SALX Certificate #2',
    image: png,
    image_data: svg,
    attributes: [{ trait_type: 'Certificate Serial', value: 'SAL-0002' }],
  },
};

// Embedded artwork never reaches the API response; everything else does.
{
  const out = serializeCertificate(stored);
  const json = JSON.stringify(out);
  assert.ok(!json.includes('data:image'), 'no base64 artwork in the response');
  assert.ok(json.length < 2000, `response stays small (${json.length} bytes)`);
  assert.equal(out.imageURI, null);
  assert.equal(out.imageURL, null);
  assert.equal(out.metadata.image, undefined);
  assert.equal(out.metadata.image_data, undefined);
  assert.equal(out.metadata.name, 'SALX Certificate #2');
  assert.deepEqual(out.metadata.attributes, stored.metadata.attributes);
  assert.equal(out.retiredCO2Kg, 10);
  assert.equal(out.projectCount, 1);
  assert.deepEqual(out.sources, [{ projectId: 1, projectName: 'E2E Test - Can Gio Mangrove', retiredTokenAmount: 1, retiredCO2Kg: 10 }]);
  assert.match(out.explorerURL, /\/tx\/0xabc$/);
  // The stored record itself is left untouched.
  assert.equal(stored.metadata.image, png);
}

// Artwork stored by reference (IPFS) is kept and turned into a gateway link.
{
  const out = serializeCertificate({ ...stored, imageURI: 'ipfs://QmImage', metadata: { image: 'ipfs://QmImage' } });
  assert.equal(out.imageURI, 'ipfs://QmImage');
  assert.equal(out.metadata.image, 'ipfs://QmImage');
  assert.match(out.imageURL, /QmImage$/);
}

// Mongoose documents are converted, and missing records stay null.
{
  const doc = { toObject: () => ({ ...stored }) };
  assert.ok(!JSON.stringify(serializeCertificate(doc)).includes('data:image'));
  assert.equal(serializeCertificate(null), null);
}

// The query projection leaves the same fields out of MongoDB reads.
assert.equal(EMBEDDED_IMAGE_PROJECTION, '-metadata.image -metadata.image_data -imageURI');

console.log('✅ Certificate serializer tests passed');
