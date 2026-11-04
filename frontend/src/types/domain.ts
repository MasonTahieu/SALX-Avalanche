export type ProjectStatus = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';

export interface Project {
  _id: string;
  chainId: number;
  marketplaceContractAddress: string;
  projectName: string;
  ownerWallet: string;
  ipfsHash: string;
  projectURI?: string | null;
  projectMetadata?: Record<string, any> | null;
  metadataValidationStatus?: 'UNVERIFIED' | 'VALID' | 'INVALID' | 'UNAVAILABLE' | string;
  metadataValidationErrors?: string[];
  tokenURI?: string | null;
  tokenMetadata?: Record<string, any> | null;
  totalCarbon: number;
  proposedCO2Kg?: number | null;
  approvedCO2Kg?: number | null;
  mintedTokenAmount: number;
  status: ProjectStatus;
  onChainProjectId?: number | null;
  approvalVotes: number;
  rejectionVotes: number;
  eligibleValidatorCount: number;
  approvalQuorum: number;
  listedTokens: number;
  soldTokens: number;
  activeListingId?: number | null;
  pricePerCredit?: string | null;
  blacklisted: boolean;
  blacklistReason?: string | null;
  cancelled: boolean;
  createdAt?: string;
}

export interface Listing {
  listingId: number;
  projectId: number;
  sellerAddress: string;
  initialAmount: number;
  remainingAmount: number;
  pricePerUnitWei: string;
  pricePerUnitETH: string;
  active: boolean;
  createdOnChainAt?: string | null;
}

export interface Stats {
  totalApprovedProjects: number;
  totalAvailableCarbon: number;
  totalRetiredCarbon: number;
  sourceOfTruth: 'blockchain' | string;
}

export interface VoteProgress {
  projectId: number;
  approvalVotes: number;
  rejectionVotes: number;
  approvalQuorum: number;
  eligibleValidatorCount?: number;
  quorumReached: boolean;
  votes: Array<{
    validatorAddress: string;
    approve: boolean;
    txHash?: string;
    votedAt?: string;
  }>;
}

export interface CertificateSource {
  projectId: number;
  projectName: string;
  retiredTokenAmount: number;
  retiredCO2Kg: number;
}

export interface Certificate {
  certificateTokenId: number;
  ownerAddress: string;
  projectId: number;
  projectName?: string;
  projectCount?: number;
  sources?: CertificateSource[];
  retirementBasketKey?: string | null;
  retiredTokenAmount: number;
  retiredCO2Kg: number;
  certificateURI?: string;
  certificateURIHttp?: string | null;
  imageURI?: string | null;
  imageURL?: string | null;
  explorerURL?: string | null;
  txHash?: string;
  status: 'PENDING' | 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  mintedAt?: string;
  metadata?: Record<string, any>;
}

export interface TransactionEvent {
  _id?: string;
  txHash: string;
  transactionType?: string;
  fromAddress?: string;
  toAddress?: string;
  projectId?: number;
  tokenAmount?: number;
  co2Kg?: number;
  timestamp?: string;
}

export interface ProjectMetadataResponse {
  projectURI: string;
  ipfsHash: string;
  metadata: Record<string, any>;
  nextAction: {
    contract: string;
    method: 'submitProject';
    args: [string, number];
    valueWei: string;
    valueETH: string;
  };
}

export interface RetirementMetadataRequest {
  ownerAddress: string;
  projectIds: number[];
  salAmounts: number[];
}

export interface CertificateMetadataResponse {
  metadataRequestId?: string;
  certificateURI: string;
  imageURI: string;
  metadata?: Record<string, any>;
  retirement?: {
    projectCount: number;
    projectIds: number[];
    salAmounts: number[];
    totalSALAmount: number;
    totalCO2Kg: number;
    sources: CertificateSource[];
  };
  authorization: {
    nonce: string | number;
    deadline: string | number;
    signature: string;
    signer: string;
  };
}
