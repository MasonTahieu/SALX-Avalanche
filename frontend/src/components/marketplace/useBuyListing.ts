import { useEffect, useRef, useState } from 'react';
import type { Listing } from '../../types/domain';
import { buySAL } from '../../services/blockchain';
import { errorMessage } from '../../lib/errors';
import { useWallet } from '../../contexts/WalletContext';

export interface BuyListingState {
  amount: number;
  setAmount: (value: number) => void;
  busy: boolean;
  isWalletConnected: boolean;
  message: string | null;
  clearMessage: () => void;
  buy: () => Promise<void>;
}

export function useBuyListing(listing: Listing, onSuccess: () => void): BuyListingState {
  const wallet = useWallet();
  const [amount, setAmountRaw] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const resumeAfterConnect = useRef(false);

  const setAmount = (value: number) =>
    setAmountRaw(Math.max(1, Math.min(listing.remainingAmount, value)));

  const buy = async () => {
    if (!wallet.address) {
      resumeAfterConnect.current = true;
      wallet.openWalletModal();
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const result = await buySAL(listing.listingId, amount, listing.pricePerUnitWei);
      setMessage(`✓ ${result.txHash.slice(0, 12)}…`);
      onSuccess();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  // Continue the purchase once the wallet dialog closes with a connected wallet.
  // Closing it without connecting drops the purchase.
  useEffect(() => {
    if (!resumeAfterConnect.current || wallet.modalOpen) return;
    resumeAfterConnect.current = false;
    if (wallet.address) void buy();
    // Only a change in the wallet state should trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.address, wallet.modalOpen]);

  return {
    amount,
    setAmount,
    busy,
    isWalletConnected: Boolean(wallet.address),
    message,
    clearMessage: () => setMessage(null),
    buy,
  };
}
