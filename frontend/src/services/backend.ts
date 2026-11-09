import { api } from './api';
import type {
  Certificate,
  CertificateMetadataResponse,
  Listing,
  Project,
  ProjectMetadataResponse,
  ProofReport,
  RetirementMetadataRequest,
  Stats,
  TransactionEvent,
  VoteProgress,
} from '../types/domain';

export const uploadDocumentToIPFS = async (file: File) => {
  const form = new FormData();
  form.append('document', file);
  return api<{ ipfsHash: string; timestamp?: string }>('/api/upload/ipfs', {
    method: 'POST',
    body: form,
  });
};

export const backend = {
  health: () => api<any>('/api/health'),
  proof: () => api<ProofReport>('/api/proof'),
  stats: () => api<Stats>('/api/projects/stats'),
  projects: (status: 'approved' | 'pending' | 'cancelled' | 'all' = 'approved') =>
    api<Project[]>(`/api/projects?status=${status}`),
  pendingProjects: (adminKey: string) =>
    api<Project[]>('/api/projects/pending', { adminKey }),
  votes: (projectId: number) => api<VoteProgress>(`/api/projects/votes/${projectId}`),

  createProjectMetadata: (payload: Record<string, unknown>) =>
    api<ProjectMetadataResponse>('/api/projects/metadata', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  adminVote: (projectId: number, approve: boolean, adminKey: string) =>
    api<{ txHash: string; blockNumber: number }>(`/api/projects/vote/${projectId}`, {
      method: 'POST',
      adminKey,
      body: JSON.stringify({ approve }),
    }),

  adminApprove: (
    mongoId: string,
    payload: { approvedCO2Kg: number; onChainProjectId?: number; tokenURI?: string },
    adminKey: string,
  ) => api<any>(`/api/projects/approve/${mongoId}`, {
    method: 'PUT',
    adminKey,
    body: JSON.stringify(payload),
  }),

  listings: (filters: { active?: boolean; projectId?: number; seller?: string } = {}) => {
    const params = new URLSearchParams();
    if (filters.active != null) params.set('active', String(filters.active));
    if (filters.projectId != null) params.set('projectId', String(filters.projectId));
    if (filters.seller) params.set('seller', filters.seller);
    const query = params.toString();
    return api<Listing[]>(`/api/listings${query ? `?${query}` : ''}`);
  },

  createCertificateMetadata: (payload: RetirementMetadataRequest) =>
    api<CertificateMetadataResponse>('/api/certificates/metadata', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  certificatesByWallet: (address: string) =>
    api<Certificate[]>(`/api/certificates/wallet/${address}`),
  certificateByTx: (txHash: string) =>
    api<Certificate | { status: 'PENDING' }>(`/api/certificates/tx/${txHash}`),
  certificateByToken: (tokenId: number) => api<Certificate>(`/api/certificates/token/${tokenId}`),
  transactions: (address: string) => api<TransactionEvent[]>(`/api/transactions/history/${address}`),
  leaderboard: () => api<any>('/api/leaderboard'),

  adminPause: (adminKey: string) => api<any>('/api/admin/blockchain/pause', { method: 'POST', adminKey }),
  adminUnpause: (adminKey: string) => api<any>('/api/admin/blockchain/unpause', { method: 'POST', adminKey }),
  adminBlacklistProject: (projectId: number, reason: string, adminKey: string) =>
    api<any>(`/api/admin/blockchain/projects/${projectId}/blacklist`, {
      method: 'POST', adminKey, body: JSON.stringify({ reason }),
    }),
  adminUnblacklistProject: (projectId: number, adminKey: string) =>
    api<any>(`/api/admin/blockchain/projects/${projectId}/unblacklist`, { method: 'POST', adminKey }),
};
