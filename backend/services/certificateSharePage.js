// A small HTML page for sharing a certificate on LinkedIn, X and chat apps.
// The frontend is a single-page app, so its URLs carry no per-certificate
// preview tags; link previews read the title, description and certificate
// image from this page instead, and people are sent on to the frontend's
// public verification page.

const DEFAULT_FRONTEND_URL = 'https://salx-avalanche.vercel.app';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character]));

const formatCO2 = (kg) => {
  const value = Number(kg) || 0;
  if (value < 1000) return `${value.toLocaleString('en-US')} kg CO₂e`;
  return `${(value / 1000).toLocaleString('en-US', { maximumFractionDigits: 2 })} tCO₂e`;
};

const frontendUrl = () => (process.env.FRONTEND_URL || DEFAULT_FRONTEND_URL).replace(/\/$/, '');

/** The public base URL of this API as the visitor reached it (Render sits behind a proxy). */
const publicApiBase = (req) => {
  if (process.env.PUBLIC_API_URL) return process.env.PUBLIC_API_URL.replace(/\/$/, '');
  const protocol = String(req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
  return `${protocol}://${req.get('host')}`;
};

const projectLabel = (certificate) => {
  const count = Number(certificate.projectCount) || (certificate.sources || []).length;
  if (count > 1) return `${count} projects`;
  return certificate.projectName || certificate.sources?.[0]?.projectName || null;
};

/**
 * @param {object} options
 * @param {number} options.tokenId
 * @param {object|null} options.certificate  serialized certificate, or null when unknown
 * @param {string} options.verifyUrl  where people are sent
 * @param {string} options.shareUrl   this page's own URL
 * @param {string} options.imageUrl   absolute URL of the certificate PNG
 */
function buildCertificateSharePage({ tokenId, certificate, verifyUrl, shareUrl, imageUrl }) {
  const amount = certificate ? formatCO2(certificate.retiredCO2Kg) : null;
  const project = certificate ? projectLabel(certificate) : null;
  const title = certificate
    ? `SALX certificate SBT #${tokenId}: ${amount} retired`
    : `SALX certificate SBT #${tokenId}`;
  const description = certificate
    ? `${amount} retired${project ? ` through ${project}` : ''}, recorded on Avalanche. Open the page to verify it on-chain.`
    : 'Open the page to verify this SALX retirement certificate on Avalanche.';

  const imageTags = certificate
    ? [
      `<meta property="og:image" content="${escapeHtml(imageUrl)}">`,
      '<meta property="og:image:type" content="image/png">',
      '<meta property="og:image:width" content="1000">',
      '<meta property="og:image:height" content="1000">',
      `<meta property="og:image:alt" content="${escapeHtml(`SALX retirement certificate SBT #${tokenId}`)}">`,
      `<meta name="twitter:image" content="${escapeHtml(imageUrl)}">`,
    ].join('\n    ')
    : '';

  // Crawlers do not run scripts, so they stay on this page and read its tags;
  // people are forwarded at once. The link covers browsers without scripts.
  const redirect = JSON.stringify(verifyUrl).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="SALX">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:url" content="${escapeHtml(shareUrl)}">
    ${imageTags}
    <meta name="twitter:card" content="${certificate ? 'summary_large_image' : 'summary'}">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(description)}">
    <script>location.replace(${redirect});</script>
  </head>
  <body style="font-family:system-ui,sans-serif;padding:24px">
    <p>Opening the <a href="${escapeHtml(verifyUrl)}">verification page for certificate SBT #${tokenId}</a>…</p>
  </body>
</html>
`;
}

module.exports = {
  buildCertificateSharePage,
  escapeHtml,
  frontendUrl,
  publicApiBase,
};
