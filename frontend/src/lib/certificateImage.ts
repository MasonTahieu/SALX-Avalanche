import { env } from '../config/env';

// Bump whenever the backend certificate artwork changes. The version is part of
// every image URL, so browsers never reuse a cached image (or a cached download
// response) from an earlier artwork.
export const CERTIFICATE_ARTWORK_VERSION = '4';

export type CertificateImageVariant = 'preview' | 'thumb' | 'download';

/**
 * PNG of an SBT certificate rendered by the backend.
 * - preview: 1000 px, shown inline
 * - thumb: 320 px, for the collection strip
 * - download: 2000 px, served as an attachment
 */
export function certificateImageUrl(tokenId: number, variant: CertificateImageVariant = 'preview') {
  const params = new URLSearchParams();
  if (variant === 'thumb') params.set('size', 'thumb');
  if (variant === 'download') params.set('download', '1');
  params.set('v', CERTIFICATE_ARTWORK_VERSION);
  return `${env.apiUrl}/api/certificates/token/${tokenId}/image.png?${params.toString()}`;
}
