import { describe, it, expect } from 'vitest';
import { env } from '../../config/env';
import {
  linkedInShareUrl,
  qrMatrix,
  qrSvgFile,
  shareLinkUrl,
  shareText,
  verifyPageUrl,
  xShareUrl,
} from '../../lib/certificateShare';

describe('certificate sharing', () => {
  it('builds the verification page and share links', () => {
    expect(verifyPageUrl(3, 'https://salx-avalanche.vercel.app')).toBe('https://salx-avalanche.vercel.app/verify/3');
    expect(shareLinkUrl(3)).toBe(`${env.apiUrl}/api/certificates/token/3/share`);

    const share = 'https://api.test/api/certificates/token/3/share';
    expect(linkedInShareUrl(share)).toBe(
      'https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fapi.test%2Fapi%2Fcertificates%2Ftoken%2F3%2Fshare',
    );
    const x = new URL(xShareUrl(share, shareText(3, 50)));
    expect(x.searchParams.get('url')).toBe(share);
    expect(x.searchParams.get('text')).toBe('Retired 50 kg CO₂e through SALX on Avalanche. Certificate SBT #3, verifiable on-chain:');
  });

  it('describes large amounts in tonnes', () => {
    expect(shareText(8, 12500)).toContain('12.5 tCO₂e');
  });

  it('draws a QR code with a quiet zone', () => {
    const qr = qrMatrix('https://salx-avalanche.vercel.app/verify/3');
    // A URL this long needs a version 3 code (29 modules) at level M, plus 4 + 4 quiet modules.
    expect(qr.size).toBe(37);
    expect(qr.path.startsWith('M4 4h1v1h-1z')).toBe(true); // top-left finder pattern corner
    expect(qr.path).not.toContain('M0 ');

    const svg = qrSvgFile(qr);
    expect(svg).toContain('viewBox="0 0 37 37"');
    expect(svg).toContain('fill="#ffffff"');
  });
});
