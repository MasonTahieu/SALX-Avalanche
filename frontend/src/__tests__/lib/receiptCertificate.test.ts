import { describe, it, expect, vi } from 'vitest';
import { Interface } from 'ethers';
import sbtArtifact from '../../contracts/abis/GreenCertificateSBT.json';

const SBT = '0xb6093FBE46BA1C0222F0D24D829EB7f310d314c7';
const OTHER = '0xBb1d739d98dAe76DD1E95e4A978Fd1E4b525ABa4';
// Decoded addresses come back checksummed; the certificate stores them in lower case.
const OWNER = '0x9a19000000000000000000000000000000000abc';

vi.mock('../../config/env', () => ({
  env: {
    certificateAddress: '0xb6093FBE46BA1C0222F0D24D829EB7f310d314c7',
    blockExplorerUrl: 'https://testnet.snowtrace.io',
    ipfsGatewayUrl: 'https://ipfs.filebase.io/ipfs',
  },
  assertPublicContractConfig: () => {},
}));

import { mintedCertificateIn } from '../../services/blockchain';
import { certificateFromReceipt } from '../../lib/mintedCertificate';

const sbt = new Interface(sbtArtifact.abi);

function eventLog(address: string, name: string, values: unknown[]) {
  const { topics, data } = sbt.encodeEventLog(sbt.getEvent(name)!, values);
  return { address, topics, data };
}

const MINTED_VALUES = [9n, OWNER, 2n, 5n, 50n, 'ipfs://QmCert'];

describe('certificate from a retirement receipt', () => {
  it('reads CertificateMinted from the SBT contract only', async () => {
    const receipt = {
      hash: '0xtx',
      logs: [
        // Same event shape from another contract: not our certificate.
        eventLog(OTHER, 'CertificateMinted', [1n, OWNER, 1n, 1n, 10n, 'ipfs://QmOther']),
        // Another event from the SBT contract.
        eventLog(SBT, 'Transfer', ['0x0000000000000000000000000000000000000000', OWNER, 9n]),
        // A log this ABI cannot decode.
        { address: SBT, topics: [`0x${'ab'.repeat(32)}`], data: '0x' },
        eventLog(SBT.toLowerCase(), 'CertificateMinted', MINTED_VALUES),
      ],
    };

    expect(await mintedCertificateIn(receipt)).toEqual({
      tokenId: 9,
      owner: OWNER.toLowerCase(),
      projectId: 2,
      salAmount: 5,
      co2Kg: 50,
      certificateURI: 'ipfs://QmCert',
      txHash: '0xtx',
    });
  });

  it('returns null when the receipt has no certificate', async () => {
    const receipt = { hash: '0xtx', logs: [eventLog(OTHER, 'CertificateMinted', MINTED_VALUES)] };
    expect(await mintedCertificateIn(receipt)).toBeNull();
  });

  it('builds a displayable certificate that links to the transaction', () => {
    const certificate = certificateFromReceipt({
      tokenId: 9,
      owner: OWNER.toLowerCase(),
      projectId: 2,
      salAmount: 5,
      co2Kg: 50,
      certificateURI: 'ipfs://QmCert',
      txHash: '0xtx',
    }, 'Ngọc Hiển Mangrove');

    expect(certificate).toMatchObject({
      certificateTokenId: 9,
      ownerAddress: OWNER.toLowerCase(),
      projectName: 'Ngọc Hiển Mangrove',
      retiredTokenAmount: 5,
      retiredCO2Kg: 50,
      certificateURIHttp: 'https://ipfs.filebase.io/ipfs/QmCert',
      explorerURL: 'https://testnet.snowtrace.io/tx/0xtx',
      status: 'ACTIVE',
    });
  });
});
