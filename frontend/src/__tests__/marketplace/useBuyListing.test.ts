import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBuyListing } from '../../components/marketplace/useBuyListing';
import type { Listing } from '../../types/domain';

vi.mock('../../services/blockchain', () => ({
  buySAL: vi.fn(),
}));

vi.mock('../../contexts/WalletContext', () => ({
  useWallet: vi.fn(),
}));

import { buySAL } from '../../services/blockchain';
import { useWallet } from '../../contexts/WalletContext';

const mockListing: Listing = {
  listingId: 42,
  projectId: 1,
  sellerAddress: '0xseller',
  initialAmount: 100,
  remainingAmount: 80,
  pricePerUnitWei: '1000000000000000',
  pricePerUnitETH: '0.001',
  active: true,
};

function mockWallet(address: string | null) {
  const openWalletModal = vi.fn();
  vi.mocked(useWallet).mockReturnValue({ address, openWalletModal } as any);
  return { openWalletModal };
}

describe('useBuyListing', () => {
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('wallet not connected', () => {
    it('opens wallet modal instead of calling buySAL', async () => {
      const { openWalletModal } = mockWallet(null);
      const { result } = renderHook(() => useBuyListing(mockListing, onSuccess));

      await act(async () => { await result.current.buy(); });

      expect(openWalletModal).toHaveBeenCalledOnce();
      expect(buySAL).not.toHaveBeenCalled();
    });

    it('continues the purchase with the chosen amount once connected', async () => {
      vi.mocked(buySAL).mockResolvedValue({ txHash: '0xhash', blockNumber: 1 });
      const wallet: any = { address: null, modalOpen: false, openWalletModal: vi.fn() };
      vi.mocked(useWallet).mockImplementation(() => wallet);
      const { result, rerender } = renderHook(() => useBuyListing(mockListing, onSuccess));

      act(() => { result.current.setAmount(3); });
      await act(async () => { await result.current.buy(); });

      wallet.modalOpen = true;
      rerender();
      wallet.address = '0xbuyer'; // connected, dialog still closing: not yet
      rerender();
      expect(buySAL).not.toHaveBeenCalled();

      wallet.modalOpen = false;
      await act(async () => { rerender(); });

      expect(buySAL).toHaveBeenCalledOnce();
      expect(buySAL).toHaveBeenCalledWith(42, 3, '1000000000000000');
    });

    it('drops the purchase when the dialog closes without connecting', async () => {
      const wallet: any = { address: null, modalOpen: false, openWalletModal: vi.fn() };
      vi.mocked(useWallet).mockImplementation(() => wallet);
      const { result, rerender } = renderHook(() => useBuyListing(mockListing, onSuccess));

      await act(async () => { await result.current.buy(); });
      wallet.modalOpen = true;
      rerender();
      wallet.modalOpen = false;
      rerender();

      // Connecting later, for another reason, must not buy anything.
      wallet.address = '0xbuyer';
      await act(async () => { rerender(); });

      expect(buySAL).not.toHaveBeenCalled();
    });

    it('reports isWalletConnected as false', () => {
      mockWallet(null);
      const { result } = renderHook(() => useBuyListing(mockListing, onSuccess));
      expect(result.current.isWalletConnected).toBe(false);
    });
  });

  describe('wallet connected — happy path', () => {
    it('calls buySAL with listingId, amount, and pricePerUnitWei', async () => {
      mockWallet('0xuser');
      vi.mocked(buySAL).mockResolvedValue({ txHash: '0xdeadbeef1234567890', blockNumber: 1 });
      const { result } = renderHook(() => useBuyListing(mockListing, onSuccess));

      await act(async () => { await result.current.buy(); });

      expect(buySAL).toHaveBeenCalledWith(42, 1, '1000000000000000');
    });

    it('calls onSuccess after a successful buy', async () => {
      mockWallet('0xuser');
      vi.mocked(buySAL).mockResolvedValue({ txHash: '0xdeadbeef1234567890', blockNumber: 1 });
      const { result } = renderHook(() => useBuyListing(mockListing, onSuccess));

      await act(async () => { await result.current.buy(); });

      expect(onSuccess).toHaveBeenCalledOnce();
    });

    it('sets a success message containing the tx hash prefix', async () => {
      mockWallet('0xuser');
      vi.mocked(buySAL).mockResolvedValue({ txHash: '0xdeadbeef1234567890', blockNumber: 1 });
      const { result } = renderHook(() => useBuyListing(mockListing, onSuccess));

      await act(async () => { await result.current.buy(); });

      expect(result.current.message).toMatch(/^✓ 0xdeadbeef/);
    });

    it('reports isWalletConnected as true', () => {
      mockWallet('0xuser');
      const { result } = renderHook(() => useBuyListing(mockListing, onSuccess));
      expect(result.current.isWalletConnected).toBe(true);
    });
  });

  describe('wallet connected — error path', () => {
    it('sets an error message when buySAL rejects', async () => {
      mockWallet('0xuser');
      vi.mocked(buySAL).mockRejectedValue({ message: 'User rejected transaction' });
      const { result } = renderHook(() => useBuyListing(mockListing, onSuccess));

      await act(async () => { await result.current.buy(); });

      expect(result.current.message).toBe('User rejected transaction');
    });

    it('does not call onSuccess when buySAL throws', async () => {
      mockWallet('0xuser');
      vi.mocked(buySAL).mockRejectedValue(new Error('contract error'));
      const { result } = renderHook(() => useBuyListing(mockListing, onSuccess));

      await act(async () => { await result.current.buy(); });

      expect(onSuccess).not.toHaveBeenCalled();
    });

    it('releases busy state after an error', async () => {
      mockWallet('0xuser');
      vi.mocked(buySAL).mockRejectedValue(new Error('fail'));
      const { result } = renderHook(() => useBuyListing(mockListing, onSuccess));

      await act(async () => { await result.current.buy(); });

      expect(result.current.busy).toBe(false);
    });
  });

  describe('amount clamping', () => {
    it('clamps amount to minimum of 1', () => {
      mockWallet(null);
      const { result } = renderHook(() => useBuyListing(mockListing, onSuccess));

      act(() => { result.current.setAmount(0); });

      expect(result.current.amount).toBe(1);
    });

    it('clamps amount to listing remainingAmount', () => {
      mockWallet(null);
      const { result } = renderHook(() => useBuyListing(mockListing, onSuccess));

      act(() => { result.current.setAmount(9999); });

      expect(result.current.amount).toBe(80);
    });

    it('accepts a valid amount within bounds', () => {
      mockWallet(null);
      const { result } = renderHook(() => useBuyListing(mockListing, onSuccess));

      act(() => { result.current.setAmount(30); });

      expect(result.current.amount).toBe(30);
    });
  });

  describe('message lifecycle', () => {
    it('clears the message when clearMessage is called', async () => {
      mockWallet('0xuser');
      vi.mocked(buySAL).mockResolvedValue({ txHash: '0xdeadbeef1234567890', blockNumber: 1 });
      const { result } = renderHook(() => useBuyListing(mockListing, onSuccess));

      await act(async () => { await result.current.buy(); });
      expect(result.current.message).not.toBeNull();

      act(() => { result.current.clearMessage(); });
      expect(result.current.message).toBeNull();
    });

    it('clears previous message before a new buy attempt', async () => {
      mockWallet('0xuser');
      vi.mocked(buySAL)
        .mockRejectedValueOnce({ message: 'first error' })
        .mockResolvedValueOnce({ txHash: '0xdeadbeef', blockNumber: 2 });
      const { result } = renderHook(() => useBuyListing(mockListing, onSuccess));

      await act(async () => { await result.current.buy(); });
      expect(result.current.message).toBe('first error');

      await act(async () => { await result.current.buy(); });
      expect(result.current.message).toMatch(/^✓/);
    });
  });
});
