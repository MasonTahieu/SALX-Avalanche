export type DocumentKind = 'pdf' | 'image' | 'text' | 'other';

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg)$/i;
const TEXT_EXT = /\.(txt|md|csv|json)$/i;

/**
 * How a project document is previewed, from the gateway's Content-Type, the
 * type recorded at upload, then the file name. Anything else (HTML, office
 * files, archives) is never rendered inline: it is offered as a download or
 * an IPFS link only.
 */
export function documentKind(contentType?: string | null, name?: string | null, declaredType?: string | null): DocumentKind {
  const types = [contentType, declaredType].map((value) => (value || '').toLowerCase().split(';')[0].trim());
  const fileName = name || '';
  for (const type of types) {
    if (type === 'application/pdf') return 'pdf';
    // SVG can carry script; it is shown through <img>, which never runs it.
    if (type.startsWith('image/')) return 'image';
    if (type === 'text/plain' || type === 'text/csv' || type === 'text/markdown' || type === 'application/json') return 'text';
  }
  if (/\.pdf$/i.test(fileName)) return 'pdf';
  if (IMAGE_EXT.test(fileName)) return 'image';
  if (TEXT_EXT.test(fileName)) return 'text';
  return 'other';
}

/** CID (and any path) of an ipfs:// URI or bare CID, for display. */
export function ipfsPath(uri: string) {
  return uri.startsWith('ipfs://') ? uri.slice('ipfs://'.length).replace(/^ipfs\//, '') : uri;
}
