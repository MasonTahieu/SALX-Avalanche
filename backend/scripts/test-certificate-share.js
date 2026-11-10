const assert = require('assert');
const {
  buildCertificateSharePage,
  frontendUrl,
  publicApiBase,
} = require('../services/certificateSharePage');

const VERIFY = 'https://salx-avalanche.vercel.app/verify/3';
const SHARE = 'https://api.example.test/api/certificates/token/3/share';
const IMAGE = 'https://api.example.test/api/certificates/token/3/image.png';

const page = (certificate) => buildCertificateSharePage({
  tokenId: 3,
  certificate,
  verifyUrl: VERIFY,
  shareUrl: SHARE,
  imageUrl: IMAGE,
});

// A known certificate: title, amount, project and the certificate image for previews.
{
  const html = page({ retiredCO2Kg: 50, projectName: 'Ngọc Hiển Mangrove', projectCount: 1 });
  assert.match(html, /<meta property="og:title" content="SALX certificate SBT #3: 50 kg CO₂e retired">/);
  assert.match(html, /through Ngọc Hiển Mangrove/);
  assert.ok(html.includes(`<meta property="og:image" content="${IMAGE}">`));
  assert.ok(html.includes(`<meta property="og:url" content="${SHARE}">`));
  assert.ok(html.includes('<meta name="twitter:card" content="summary_large_image">'));
  assert.ok(html.includes(`location.replace("${VERIFY}")`), 'forwards people to the verification page');
  assert.ok(html.includes(`<a href="${VERIFY}">`), 'links there for browsers without scripts');
}

// Tonnes above 1,000 kg, and a basket of projects.
{
  const html = page({ retiredCO2Kg: 12500, projectCount: 3, sources: [{}, {}, {}] });
  assert.match(html, /12\.5 tCO₂e retired through 3 projects/);
}

// Unknown certificate: still forwards, without an image or claimed amount.
{
  const html = page(null);
  assert.ok(!html.includes('og:image'));
  assert.ok(html.includes('<meta name="twitter:card" content="summary">'));
  assert.ok(html.includes(`location.replace("${VERIFY}")`));
}

// Stored text is escaped, so a project name cannot inject markup or scripts.
{
  const html = page({ retiredCO2Kg: 10, projectName: '<script>alert(1)</script>"x' });
  assert.ok(!html.includes('<script>alert(1)'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;&quot;x'));
}
{
  const html = buildCertificateSharePage({
    tokenId: 3, certificate: null, verifyUrl: 'https://x.test/</script><script>alert(1)</script>', shareUrl: SHARE, imageUrl: IMAGE,
  });
  assert.ok(!html.includes('</script><script>alert(1)'), 'the redirect target cannot close the script');
}

// The public API base follows the proxy's protocol, or an explicit setting.
{
  const req = (headers) => ({ protocol: 'http', get: (name) => headers[name.toLowerCase()] });
  const saved = process.env.PUBLIC_API_URL;
  delete process.env.PUBLIC_API_URL;
  assert.equal(publicApiBase(req({ host: 'api.onrender.com', 'x-forwarded-proto': 'https' })), 'https://api.onrender.com');
  assert.equal(publicApiBase(req({ host: 'localhost:5000' })), 'http://localhost:5000');
  process.env.PUBLIC_API_URL = 'https://api.example.test/';
  assert.equal(publicApiBase(req({ host: 'ignored' })), 'https://api.example.test');
  if (saved === undefined) delete process.env.PUBLIC_API_URL; else process.env.PUBLIC_API_URL = saved;
}

// The frontend defaults to the live site and honours FRONTEND_URL.
{
  const saved = process.env.FRONTEND_URL;
  delete process.env.FRONTEND_URL;
  assert.equal(frontendUrl(), 'https://salx-avalanche.vercel.app');
  process.env.FRONTEND_URL = 'http://localhost:4173/';
  assert.equal(frontendUrl(), 'http://localhost:4173');
  if (saved === undefined) delete process.env.FRONTEND_URL; else process.env.FRONTEND_URL = saved;
}

console.log('✅ Certificate share page tests passed');
