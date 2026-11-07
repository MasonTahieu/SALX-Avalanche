import { describe, expect, it } from 'vitest';
import { ipfsToHttp } from '../../lib/projectMeta';
import { env } from '../../config/env';

const CID_V0 = 'QmQMAoWkomo3ojQT6jNFsBEYYtJUgC5NRkCCjSGBNgivhK';
const CID_V1 = 'bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy';

describe('ipfsToHttp', () => {
  it('uses the configured gateway (Filebase by default)', () => {
    expect(env.ipfsGatewayUrl).toBe('https://ipfs.filebase.io/ipfs');
    expect(ipfsToHttp(`ipfs://${CID_V0}`)).toBe(`https://ipfs.filebase.io/ipfs/${CID_V0}`);
  });

  it('accepts bare v0 and v1 CIDs and ipfs://ipfs/ paths', () => {
    expect(ipfsToHttp(CID_V0)).toBe(`${env.ipfsGatewayUrl}/${CID_V0}`);
    expect(ipfsToHttp(CID_V1)).toBe(`${env.ipfsGatewayUrl}/${CID_V1}`);
    expect(ipfsToHttp(`ipfs://ipfs/${CID_V0}/report.pdf`)).toBe(`${env.ipfsGatewayUrl}/${CID_V0}/report.pdf`);
  });

  it('adds an encoded filename so a saved file keeps its name', () => {
    expect(ipfsToHttp(`ipfs://${CID_V0}`, 'MRV report (v1).pdf'))
      .toBe(`${env.ipfsGatewayUrl}/${CID_V0}?filename=MRV%20report%20(v1).pdf`);
  });

  it('leaves non-IPFS values unchanged', () => {
    expect(ipfsToHttp('https://example.org/doc.pdf')).toBe('https://example.org/doc.pdf');
    expect(ipfsToHttp('Qm-not-a-cid')).toBe('Qm-not-a-cid');
    expect(ipfsToHttp('')).toBe('');
    expect(ipfsToHttp(null)).toBe('');
  });
});
