import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Listing } from '../../types/domain';

vi.mock('../../services/backend', () => ({
  backend: {
    createCertificateMetadata: vi.fn(),
    certificateByTx: vi.fn(),
  },
}));

vi.mock('../../services/blockchain', () => ({
  buySAL: vi.fn(),
  ensureMarketplaceApproval: vi.fn(),
  isMarketplaceApproved: vi.fn(),
  retireSAL: vi.fn(),
  retirementConfig: vi.fn(),
}));

vi.mock('../../contexts/WalletContext', () => ({
  useWallet: vi.fn(),
}));

import {
  useCheckoutFlow,
  CERTIFICATE_POLL_MS,
  DRAFT_RETRY_MS,
  type CheckoutOptions,
} from '../../components/marketplace/useCheckoutFlow';
import { backend } from '../../services/backend';
import { ApiError } from '../../services/api';
import {
  buySAL,
  ensureMarketplaceApproval,
  isMarketplaceApproved,
  retireSAL,
  retirementConfig,
} from '../../services/blockchain';
import { useWallet } from '../../contexts/WalletContext';

const LISTING: Listing = {
  listingId: 3,
  projectId: 2,
  sellerAddress: '0xseller',
  initialAmount: 1200,
  remainingAmount: 1200,
  pricePerUnitWei: '2000000000000000',
  pricePerUnitETH: '0.002',
  active: true,
};

const DRAFT = {
  certificateURI: 'ipfs://QmCert',
  imageURI: 'ipfs://QmImg',
  authorization: { nonce: 0, deadline: 9999999999, signature: '0xSIG', signer: '0xSigner' },
};

const MINTED = {
  tokenId: 3,
  owner: '0xbuyer',
  projectId: 2,
  salAmount: 5,
  co2Kg: 50,
  certificateURI: 'ipfs://QmCert',
  txHash: '0xretire',
};

const CERTIFICATE = {
  certificateTokenId: 3,
  ownerAddress: '0xbuyer',
  projectId: 2,
  retiredTokenAmount: 5,
  retiredCO2Kg: 50,
  status: 'ACTIVE' as const,
};

function mockWallet(address: string | null = '0xbuyer') {
  const wallet: any = { address, modalOpen: false, openWalletModal: vi.fn() };
  vi.mocked(useWallet).mockImplementation(() => wallet);
  return wallet;
}

async function renderFlow(options: Partial<CheckoutOptions> = {}) {
  const onPurchased = vi.fn();
  const hook = renderHook(() => useCheckoutFlow({
    listing: LISTING,
    amount: 5,
    retireNow: true,
    onPurchased,
    ...options,
  }));
  // Let the fee and approval reads on mount settle.
  await act(async () => {});
  return { ...hook, onPurchased };
}

describe('useCheckoutFlow', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockWallet();
    vi.mocked(retirementConfig).mockResolvedValue({ maxProjects: 5, kgPerSAL: 10, certificateFeeETH: '0.001' });
    vi.mocked(isMarketplaceApproved).mockResolvedValue(true);
    vi.mocked(buySAL).mockResolvedValue({ txHash: '0xbuy', blockNumber: 1 });
    vi.mocked(ensureMarketplaceApproval).mockResolvedValue(null);
    vi.mocked(backend.createCertificateMetadata).mockResolvedValue(DRAFT as any);
    vi.mocked(retireSAL).mockResolvedValue({ txHash: '0xretire', blockNumber: 2, minted: MINTED });
    vi.mocked(backend.certificateByTx).mockResolvedValue(CERTIFICATE as any);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads the certificate fee, kg per SAL and whether approval is needed', async () => {
    vi.mocked(isMarketplaceApproved).mockResolvedValue(false);
    const { result } = await renderFlow();

    expect(result.current.certificateFeeETH).toBe('0.001');
    expect(result.current.kgPerSAL).toBe(10);
    expect(result.current.approvalNeeded).toBe(true);
    expect(isMarketplaceApproved).toHaveBeenCalledWith('0xbuyer');
    expect(result.current.started).toBe(false);
  });

  it('buys, retires and returns the certificate in one run', async () => {
    const { result, onPurchased } = await renderFlow();

    await act(async () => { await result.current.run(); });

    expect(buySAL).toHaveBeenCalledWith(3, 5, '2000000000000000');
    expect(ensureMarketplaceApproval).toHaveBeenCalledWith('0xbuyer');
    expect(backend.createCertificateMetadata).toHaveBeenCalledWith({
      ownerAddress: '0xbuyer',
      projectIds: [2],
      salAmounts: [5],
    });
    expect(retireSAL).toHaveBeenCalledWith('0xbuyer', [2], [5], 'ipfs://QmCert', 9999999999, '0xSIG');
    expect(backend.certificateByTx).toHaveBeenCalledWith('0xretire');
    expect(onPurchased).toHaveBeenCalledOnce();

    expect(result.current.minted).toEqual(MINTED);
    expect(result.current.certificate).toEqual(CERTIFICATE);
    expect(result.current.steps).toEqual({ buy: 'done', approve: 'skipped', retire: 'done', certificate: 'done' });
    expect(result.current.buyTxHash).toBe('0xbuy');
    expect(result.current.retireTxHash).toBe('0xretire');
    expect(result.current.finished).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.busy).toBe(false);
  });

  it('marks approval done when the wallet allows retirement for the first time', async () => {
    vi.mocked(isMarketplaceApproved).mockResolvedValue(false);
    vi.mocked(ensureMarketplaceApproval).mockResolvedValue({ txHash: '0xapprove', blockNumber: 1 });
    const { result } = await renderFlow();

    await act(async () => { await result.current.run(); });

    expect(result.current.steps.approve).toBe('done');
    expect(result.current.approvalNeeded).toBe(false);
  });

  it('only buys when retiring now is turned off', async () => {
    const { result, onPurchased } = await renderFlow({ retireNow: false });

    await act(async () => { await result.current.run(); });

    expect(buySAL).toHaveBeenCalledOnce();
    expect(onPurchased).toHaveBeenCalledOnce();
    expect(ensureMarketplaceApproval).not.toHaveBeenCalled();
    expect(backend.createCertificateMetadata).not.toHaveBeenCalled();
    expect(retireSAL).not.toHaveBeenCalled();
    expect(result.current.steps).toEqual({ buy: 'done', approve: 'waiting', retire: 'waiting', certificate: 'waiting' });
    expect(result.current.finished).toBe(true);
  });

  it('stops before retiring when the purchase fails', async () => {
    vi.mocked(buySAL).mockRejectedValue({ shortMessage: 'user rejected action' });
    const { result, onPurchased } = await renderFlow();

    await act(async () => { await result.current.run(); });

    expect(result.current.steps.buy).toBe('failed');
    expect(result.current.error).toBe('user rejected action');
    expect(result.current.bought).toBe(false);
    expect(onPurchased).not.toHaveBeenCalled();
    expect(ensureMarketplaceApproval).not.toHaveBeenCalled();
    expect(retireSAL).not.toHaveBeenCalled();
  });

  it('retries a failed retirement without buying again', async () => {
    vi.mocked(retireSAL)
      .mockRejectedValueOnce({ shortMessage: 'user rejected action' })
      .mockResolvedValueOnce({ txHash: '0xretire', blockNumber: 2, minted: MINTED });
    const { result } = await renderFlow();

    await act(async () => { await result.current.run(); });

    expect(result.current.steps).toMatchObject({ buy: 'done', retire: 'failed' });
    expect(result.current.error).toBe('user rejected action');
    expect(result.current.bought).toBe(true);
    expect(result.current.finished).toBe(false);

    await act(async () => { await result.current.run(); });

    expect(buySAL).toHaveBeenCalledOnce();
    expect(ensureMarketplaceApproval).toHaveBeenCalledOnce();
    expect(retireSAL).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeNull();
    expect(result.current.certificate).toEqual(CERTIFICATE);
  });

  it('waits for the backend to see the purchased SAL before retiring', async () => {
    vi.useFakeTimers();
    vi.mocked(backend.createCertificateMetadata)
      .mockRejectedValueOnce(new ApiError(400, { error: 'Ví không đủ SAL của dự án #2' }))
      .mockResolvedValueOnce(DRAFT as any);
    const { result } = await renderFlow();

    let running!: Promise<void>;
    act(() => { running = result.current.run(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(DRAFT_RETRY_MS); });
    await act(async () => { await running; });

    expect(backend.createCertificateMetadata).toHaveBeenCalledTimes(2);
    expect(retireSAL).toHaveBeenCalledOnce();
    expect(result.current.error).toBeNull();
  });

  it('does not retry other certificate errors', async () => {
    vi.mocked(backend.createCertificateMetadata).mockRejectedValue(new ApiError(500, { error: 'IPFS upload failed' }));
    const { result } = await renderFlow();

    await act(async () => { await result.current.run(); });

    expect(backend.createCertificateMetadata).toHaveBeenCalledOnce();
    expect(retireSAL).not.toHaveBeenCalled();
    expect(result.current.steps.retire).toBe('failed');
    expect(result.current.error).toBe('IPFS upload failed');
  });

  it('keeps asking for the certificate until the backend has recorded it', async () => {
    vi.useFakeTimers();
    vi.mocked(backend.certificateByTx)
      .mockResolvedValueOnce({ status: 'PENDING' })
      .mockResolvedValueOnce(CERTIFICATE as any);
    const { result } = await renderFlow();

    await act(async () => { await result.current.run(); });

    expect(result.current.steps.certificate).toBe('active');
    expect(result.current.certificate).toBeNull();
    expect(result.current.minted).toEqual(MINTED); // known from the receipt already
    expect(result.current.finished).toBe(false);

    await act(async () => { await vi.advanceTimersByTimeAsync(CERTIFICATE_POLL_MS); });

    expect(backend.certificateByTx).toHaveBeenCalledTimes(2);
    expect(result.current.certificate).toEqual(CERTIFICATE);
    expect(result.current.steps.certificate).toBe('done');
  });

  it('ignores a second run while one is in progress', async () => {
    let finishPurchase!: (value: { txHash: string; blockNumber: number }) => void;
    vi.mocked(buySAL).mockImplementation(() => new Promise(resolve => { finishPurchase = resolve; }));
    const { result } = await renderFlow({ retireNow: false });

    let first!: Promise<void>;
    act(() => { first = result.current.run(); });
    await act(async () => { await result.current.run(); });
    await act(async () => {
      finishPurchase({ txHash: '0xbuy', blockNumber: 1 });
      await first;
    });

    expect(buySAL).toHaveBeenCalledOnce();
  });

  describe('without a connected wallet', () => {
    it('opens the wallet dialog and carries on once connected', async () => {
      const wallet = mockWallet(null);
      const { result, rerender } = await renderFlow();

      await act(async () => { await result.current.run(); });

      expect(wallet.openWalletModal).toHaveBeenCalledOnce();
      expect(buySAL).not.toHaveBeenCalled();
      expect(result.current.started).toBe(false);

      wallet.modalOpen = true;
      rerender();
      wallet.address = '0xbuyer'; // connected, dialog still closing: not yet
      rerender();
      expect(buySAL).not.toHaveBeenCalled();

      wallet.modalOpen = false;
      await act(async () => { rerender(); });

      expect(buySAL).toHaveBeenCalledWith(3, 5, '2000000000000000');
      expect(result.current.certificate).toEqual(CERTIFICATE);
    });

    it('drops the request when the dialog closes without connecting', async () => {
      const wallet = mockWallet(null);
      const { result, rerender } = await renderFlow();

      await act(async () => { await result.current.run(); });
      wallet.modalOpen = true;
      rerender();
      wallet.modalOpen = false;
      rerender();

      // Connecting later, for another reason, must not buy anything.
      wallet.address = '0xbuyer';
      await act(async () => { rerender(); });

      expect(buySAL).not.toHaveBeenCalled();
    });
  });
});
