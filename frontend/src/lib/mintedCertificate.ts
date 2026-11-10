import { env } from '../config/env';
import type { Certificate, MintedCertificate } from '../types/domain';
import { ipfsToHttp } from './projectMeta';

/**
 * A certificate built from the retirement receipt alone, shown until the
 * backend has recorded the full one (with its artwork).
 */
export function certificateFromReceipt(minted: MintedCertificate, projectName?: string): Certificate {
  return {
    certificateTokenId: minted.tokenId,
    ownerAddress: minted.owner,
    projectId: minted.projectId,
    projectName,
    retiredTokenAmount: minted.salAmount,
    retiredCO2Kg: minted.co2Kg,
    certificateURI: minted.certificateURI,
    certificateURIHttp: ipfsToHttp(minted.certificateURI) || null,
    explorerURL: `${env.blockExplorerUrl}/tx/${minted.txHash}`,
    txHash: minted.txHash,
    status: 'ACTIVE',
    mintedAt: new Date().toISOString(),
  };
}
