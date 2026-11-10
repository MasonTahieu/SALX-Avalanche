const { ipfsToHttp } = require('./ipfsService');

// Fields that hold the minted artwork inline as base64 (a ~330 KB PNG and a
// ~160 KB SVG). API responses leave them out: pages load the artwork from
// /token/:id/image.png, and the full metadata stays in the database and at
// /:tokenId/metadata.
const EMBEDDED_IMAGE_PROJECTION = '-metadata.image -metadata.image_data -imageURI';

const isDataUri = (value) => typeof value === 'string' && value.startsWith('data:');

const withoutEmbeddedImages = (metadata) => {
  if (!metadata || typeof metadata !== 'object') return metadata;
  const { image, image_data: imageData, ...rest } = metadata;
  const kept = { ...rest };
  if (image && !isDataUri(image)) kept.image = image;
  if (imageData && !isDataUri(imageData)) kept.image_data = imageData;
  return kept;
};

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

  const imageURI = isDataUri(data.imageURI) ? null : (data.imageURI ?? null);
  const metadata = withoutEmbeddedImages(data.metadata);

  return {
    ...data,
    metadata,
    imageURI,
    projectCount: data.projectCount || sources.length || 1,
    sources,
    certificateURIHttp: ipfsToHttp(data.certificateURI),
    imageURL: ipfsToHttp(imageURI || metadata?.image) || null,
    explorerURL: data.txHash
      ? `${(process.env.BLOCK_EXPLORER_URL || 'https://testnet.snowtrace.io').replace(/\/$/, '')}/tx/${data.txHash}`
      : null,
  };
};

module.exports = {
  EMBEDDED_IMAGE_PROJECTION,
  serializeCertificate,
};
