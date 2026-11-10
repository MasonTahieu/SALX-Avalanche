import qrcode from 'qrcode-generator';
import { env } from '../config/env';
import { formatCO2 } from './format';

/** The public page where anyone can check a certificate against the chain. */
export const verifyPageUrl = (tokenId: number, origin = window.location.origin) =>
  `${origin}/verify/${tokenId}`;

/**
 * The link to post on social networks. The site is a single-page app, so link
 * previews cannot read a certificate's image from it; this backend page carries
 * the preview tags (title, certificate image) and forwards people to the
 * verification page.
 */
export const shareLinkUrl = (tokenId: number) => `${env.apiUrl}/api/certificates/token/${tokenId}/share`;

export const shareText = (tokenId: number, co2Kg: number) =>
  `Retired ${formatCO2(co2Kg, 'en-US')} through SALX on Avalanche. Certificate SBT #${tokenId}, verifiable on-chain:`;

export const linkedInShareUrl = (url: string) =>
  `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;

export const xShareUrl = (url: string, text: string) =>
  `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;

export interface QrMatrix {
  /** Width and height in modules, quiet zone included. */
  size: number;
  /** SVG path of the dark modules. */
  path: string;
}

/** A QR code as an SVG path, with the standard four-module quiet zone. */
export function qrMatrix(text: string, margin = 4): QrMatrix {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  let path = '';
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (qr.isDark(row, col)) path += `M${col + margin} ${row + margin}h1v1h-1z`;
    }
  }
  return { size: count + margin * 2, path };
}

/** A standalone SVG file of the QR code, dark on white so it scans when printed. */
export function qrSvgFile({ size, path }: QrMatrix) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size * 8}" height="${size * 8}" shape-rendering="crispEdges">`
    + `<rect width="${size}" height="${size}" fill="#ffffff"/><path d="${path}" fill="#0b1311"/></svg>`;
}
