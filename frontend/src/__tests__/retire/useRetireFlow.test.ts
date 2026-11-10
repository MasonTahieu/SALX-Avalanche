import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('../../services/backend', () => ({
  backend: {
    projects: vi.fn(),
    createCertificateMetadata: vi.fn(),
    certificateByTx: vi.fn(),
  },
  uploadDocumentToIPFS: vi.fn(),
}));

vi.mock('../../services/blockchain', () => ({
  retirementConfig: vi.fn(),
  salBalance: vi.fn(),
  retireSAL: vi.fn(),
}));

vi.mock('../../contexts/WalletContext', () => ({
  useWallet: vi.fn(),
}));

import { useRetireFlow } from '../../components/retire/useRetireFlow';
import { backend } from '../../services/backend';
import { retirementConfig, salBalance, retireSAL } from '../../services/blockchain';
import { useWallet } from '../../contexts/WalletContext';

const mockProjects = vi.mocked(backend.projects);
const mockCreateCertMeta = vi.mocked(backend.createCertificateMetadata);
const mockCertByTx = vi.mocked(backend.certificateByTx);
const mockRetirementConfig = vi.mocked(retirementConfig);
const mockSalBalance = vi.mocked(salBalance);
const mockRetireSAL = vi.mocked(retireSAL);
const mockUseWallet = vi.mocked(useWallet);

const WALLET = { address: '0xUser', connected: true, connecting: false, openWalletModal: vi.fn() };
const DISCONNECTED = { address: null, connected: false, connecting: false, openWalletModal: vi.fn() };

const PROJECT_A = {
  _id: 'a1',
  onChainProjectId: 1,
  projectName: 'Forest A',
  blacklisted: false,
  status: 'Approved',
} as any;
const PROJECT_B = {
  _id: 'b2',
  onChainProjectId: 2,
  projectName: 'Wind B',
  blacklisted: false,
  status: 'Approved',
} as any;

const CERT_META_RESP = {
  metadataRequestId: 'req1',
  certificateURI: 'ipfs://QmCert',
  imageURI: 'ipfs://QmImg',
  authorization: {
    nonce: 1,
    deadline: 9999999999,
    signature: '0xSIG',
    signer: '0xSigner',
  },
};

const FULL_CERT = {
  certificateTokenId: 7,
  ownerAddress: '0xUser',
  projectId: 1,
  retiredTokenAmount: 5,
  retiredCO2Kg: 50,
  status: 'ACTIVE' as const,
};

function setupDefaultMocks() {
  mockRetirementConfig.mockResolvedValue({ maxProjects: 5, kgPerSAL: 10, certificateFeeETH: '0.00067' });
  mockProjects.mockResolvedValue([PROJECT_A, PROJECT_B]);
  mockSalBalance.mockImplementation(async (_, projectId) => projectId === 1 ? 20 : 10);
}

describe('useRetireFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseWallet.mockReturnValue(WALLET as any);
    setupDefaultMocks();
  });

  describe('initialization', () => {
    it('starts with empty state when wallet is connected', () => {
      const { result } = renderHook(() => useRetireFlow());
      expect(result.current.holdings).toHaveLength(0);
      expect(result.current.selection).toEqual({});
      expect(result.current.selectedRows).toHaveLength(0);
      expect(result.current.totalSAL).toBe(0);
      expect(result.current.busy).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.certState.phase).toBe('idle');
    });

    it('does not load holdings when wallet is disconnected', async () => {
      mockUseWallet.mockReturnValue(DISCONNECTED as any);
      renderHook(() => useRetireFlow());
      await act(async () => {});
      expect(mockProjects).not.toHaveBeenCalled();
    });

    it('loads holdings on mount for connected wallet', async () => {
      const { result } = renderHook(() => useRetireFlow());
      await waitFor(() => expect(result.current.holdings).toHaveLength(2));
      expect(result.current.holdings[0].balance).toBe(20);
      expect(result.current.holdings[1].balance).toBe(10);
    });

    it('filters out projects with zero balance', async () => {
      mockSalBalance.mockResolvedValue(0);
      const { result } = renderHook(() => useRetireFlow());
      await waitFor(() => expect(result.current.loadingHoldings).toBe(false));
      expect(result.current.holdings).toHaveLength(0);
    });

    it('populates config from retirementConfig()', async () => {
      const { result } = renderHook(() => useRetireFlow());
      await waitFor(() => expect(result.current.config.feeETH).toBe('0.00067'));
      expect(result.current.config.maxProjects).toBe(5);
      expect(result.current.config.kgPerSAL).toBe(10);
    });
  });

  describe('toggleSource', () => {
    it('selects a project with amount=1', async () => {
      const { result } = renderHook(() => useRetireFlow());
      await waitFor(() => expect(result.current.holdings).toHaveLength(2));
      act(() => result.current.toggleSource(result.current.holdings[0]));
      expect(result.current.selection[1]).toBe(1);
      expect(result.current.selectedRows).toHaveLength(1);
    });

    it('deselects an already-selected project', async () => {
      const { result } = renderHook(() => useRetireFlow());
      await waitFor(() => expect(result.current.holdings).toHaveLength(2));
      act(() => result.current.toggleSource(result.current.holdings[0]));
      act(() => result.current.toggleSource(result.current.holdings[0]));
      expect(result.current.selectedRows).toHaveLength(0);
    });

    it('silently rejects selection when maxProjects is reached', async () => {
      mockRetirementConfig.mockResolvedValue({ maxProjects: 1, kgPerSAL: 10, certificateFeeETH: '0.00067' });
      const { result } = renderHook(() => useRetireFlow());
      await waitFor(() => expect(result.current.holdings).toHaveLength(2));
      act(() => result.current.toggleSource(result.current.holdings[0]));
      act(() => result.current.toggleSource(result.current.holdings[1]));
      expect(result.current.selectedRows).toHaveLength(1); // second add blocked
    });
  });

  describe('setAmount', () => {
    it('updates amount for a selected project', async () => {
      const { result } = renderHook(() => useRetireFlow());
      await waitFor(() => expect(result.current.holdings).toHaveLength(2));
      act(() => result.current.toggleSource(result.current.holdings[0]));
      act(() => result.current.setAmount(1, 15));
      expect(result.current.selection[1]).toBe(15);
      expect(result.current.totalSAL).toBe(15);
    });
  });

  describe('invalidAmount', () => {
    it('is true when amount exceeds balance', async () => {
      const { result } = renderHook(() => useRetireFlow());
      await waitFor(() => expect(result.current.holdings).toHaveLength(2));
      act(() => result.current.toggleSource(result.current.holdings[0]));
      act(() => result.current.setAmount(1, 999));
      expect(result.current.invalidAmount).toBe(true);
    });

    it('is false when amount is within balance', async () => {
      const { result } = renderHook(() => useRetireFlow());
      await waitFor(() => expect(result.current.holdings).toHaveLength(2));
      act(() => result.current.toggleSource(result.current.holdings[0]));
      act(() => result.current.setAmount(1, 5));
      expect(result.current.invalidAmount).toBe(false);
    });
  });

  describe('run()', () => {
    it('calls createCertificateMetadata then retireSAL with correct args', async () => {
      mockCreateCertMeta.mockResolvedValue(CERT_META_RESP);
      mockRetireSAL.mockResolvedValue({ txHash: '0xTX', blockNumber: 42, minted: null });
      mockCertByTx.mockResolvedValue(FULL_CERT as any);

      const { result } = renderHook(() => useRetireFlow());
      await waitFor(() => expect(result.current.holdings).toHaveLength(2));

      act(() => result.current.toggleSource(result.current.holdings[0]));
      act(() => result.current.setAmount(1, 5));
      await act(async () => { await result.current.run(); });

      expect(mockCreateCertMeta).toHaveBeenCalledWith({
        ownerAddress: '0xUser',
        projectIds: [1],
        salAmounts: [5],
      });
      expect(mockRetireSAL).toHaveBeenCalledWith(
        '0xUser',
        [1],
        [5],
        'ipfs://QmCert',
        9999999999,
        '0xSIG',
      );
    });

    it('exposes the SBT from the receipt while the backend catches up, until reset', async () => {
      const minted = {
        tokenId: 7, owner: '0xuser', projectId: 1, salAmount: 5, co2Kg: 50,
        certificateURI: 'ipfs://QmCert', txHash: '0xTX',
      };
      mockCreateCertMeta.mockResolvedValue(CERT_META_RESP);
      mockRetireSAL.mockResolvedValue({ txHash: '0xTX', blockNumber: 42, minted });
      mockCertByTx.mockResolvedValue({ status: 'PENDING' });

      const { result } = renderHook(() => useRetireFlow());
      await waitFor(() => expect(result.current.holdings).toHaveLength(2));

      act(() => result.current.toggleSource(result.current.holdings[0]));
      act(() => result.current.setAmount(1, 5));
      await act(async () => { await result.current.run(); });

      expect(result.current.certState.phase).toBe('pending');
      expect(result.current.minted).toEqual(minted);

      act(() => result.current.resetAfterRetirement());
      expect(result.current.minted).toBeNull();
    });

    it('sets certState to found when cert is immediately indexed', async () => {
      mockCreateCertMeta.mockResolvedValue(CERT_META_RESP);
      mockRetireSAL.mockResolvedValue({ txHash: '0xTX', blockNumber: 42, minted: null });
      mockCertByTx.mockResolvedValue(FULL_CERT as any);

      const { result } = renderHook(() => useRetireFlow());
      await waitFor(() => expect(result.current.holdings).toHaveLength(2));
      act(() => result.current.toggleSource(result.current.holdings[0]));
      await act(async () => { await result.current.run(); });

      expect(result.current.certState.phase).toBe('found');
      if (result.current.certState.phase === 'found') {
        expect(result.current.certState.certificate.certificateTokenId).toBe(7);
      }
    });

    it('sets certState to pending when cert is not indexed yet', async () => {
      mockCreateCertMeta.mockResolvedValue(CERT_META_RESP);
      mockRetireSAL.mockResolvedValue({ txHash: '0xTX', blockNumber: 42, minted: null });
      mockCertByTx.mockResolvedValue({ status: 'PENDING' } as any);

      const { result } = renderHook(() => useRetireFlow());
      await waitFor(() => expect(result.current.holdings).toHaveLength(2));
      act(() => result.current.toggleSource(result.current.holdings[0]));
      await act(async () => { await result.current.run(); });

      expect(result.current.certState.phase).toBe('pending');
      if (result.current.certState.phase === 'pending') {
        expect(result.current.certState.txHash).toBe('0xTX');
      }
    });

    it('sets certState to pending when certificateByTx throws', async () => {
      mockCreateCertMeta.mockResolvedValue(CERT_META_RESP);
      mockRetireSAL.mockResolvedValue({ txHash: '0xTX', blockNumber: 42, minted: null });
      mockCertByTx.mockRejectedValue(new Error('not found'));

      const { result } = renderHook(() => useRetireFlow());
      await waitFor(() => expect(result.current.holdings).toHaveLength(2));
      act(() => result.current.toggleSource(result.current.holdings[0]));
      await act(async () => { await result.current.run(); });

      expect(result.current.certState.phase).toBe('pending');
    });

    it('sets error and stays busy=false when retireSAL throws', async () => {
      mockCreateCertMeta.mockResolvedValue(CERT_META_RESP);
      mockRetireSAL.mockRejectedValue(new Error('user rejected'));

      const { result } = renderHook(() => useRetireFlow());
      await waitFor(() => expect(result.current.holdings).toHaveLength(2));
      act(() => result.current.toggleSource(result.current.holdings[0]));
      await act(async () => { await result.current.run(); });

      expect(result.current.error).toBe('user rejected');
      expect(result.current.busy).toBe(false);
      expect(result.current.certState.phase).toBe('idle');
    });

    it('clears selection after successful retirement', async () => {
      mockCreateCertMeta.mockResolvedValue(CERT_META_RESP);
      mockRetireSAL.mockResolvedValue({ txHash: '0xTX', blockNumber: 42, minted: null });
      mockCertByTx.mockResolvedValue(FULL_CERT as any);

      const { result } = renderHook(() => useRetireFlow());
      await waitFor(() => expect(result.current.holdings).toHaveLength(2));
      act(() => { result.current.toggleSource(result.current.holdings[0]); result.current.setAmount(1, 10); });
      await act(async () => { await result.current.run(); });

      expect(result.current.selection).toEqual({});
    });
  });

  describe('reloadCertificate', () => {
    it('transitions from pending to found when cert becomes available', async () => {
      mockCreateCertMeta.mockResolvedValue(CERT_META_RESP);
      mockRetireSAL.mockResolvedValue({ txHash: '0xTX', blockNumber: 42, minted: null });
      mockCertByTx
        .mockResolvedValueOnce({ status: 'PENDING' } as any)
        .mockResolvedValueOnce(FULL_CERT as any);

      const { result } = renderHook(() => useRetireFlow());
      await waitFor(() => expect(result.current.holdings).toHaveLength(2));
      act(() => result.current.toggleSource(result.current.holdings[0]));
      await act(async () => { await result.current.run(); });
      expect(result.current.certState.phase).toBe('pending');

      await act(async () => { await result.current.reloadCertificate(); });
      expect(result.current.certState.phase).toBe('found');
    });

    it('is a no-op when certState is idle', async () => {
      const { result } = renderHook(() => useRetireFlow());
      await act(async () => { await result.current.reloadCertificate(); });
      expect(mockCertByTx).not.toHaveBeenCalled();
    });
  });

  describe('resetAfterRetirement', () => {
    it('resets selection, certState, and error', async () => {
      mockCreateCertMeta.mockResolvedValue(CERT_META_RESP);
      mockRetireSAL.mockResolvedValue({ txHash: '0xTX', blockNumber: 42, minted: null });
      mockCertByTx.mockResolvedValue(FULL_CERT as any);

      const { result } = renderHook(() => useRetireFlow());
      await waitFor(() => expect(result.current.holdings).toHaveLength(2));
      act(() => result.current.toggleSource(result.current.holdings[0]));
      await act(async () => { await result.current.run(); });
      expect(result.current.certState.phase).not.toBe('idle');

      act(() => result.current.resetAfterRetirement());
      expect(result.current.certState.phase).toBe('idle');
      expect(result.current.selection).toEqual({});
      expect(result.current.error).toBeNull();
    });
  });

  describe('clearError', () => {
    it('resets error to null', async () => {
      mockCreateCertMeta.mockRejectedValue(new Error('fail'));

      const { result } = renderHook(() => useRetireFlow());
      await waitFor(() => expect(result.current.holdings).toHaveLength(2));
      act(() => result.current.toggleSource(result.current.holdings[0]));
      await act(async () => { await result.current.run(); });
      expect(result.current.error).toBeTruthy();

      act(() => result.current.clearError());
      expect(result.current.error).toBeNull();
    });
  });
});
