import { useEffect, useState } from 'react';
import { env } from '../../config/env';
import { useWallet } from '../../contexts/WalletContext';
import { needsFunding, TEST_AVAX_FAUCET_URL } from '../../lib/walletFunding';
import './FundingNotice.css';

const BALANCE_POLL_MS = 15_000;

/** Email wallets start empty, so show where to send AVAX until the balance arrives. */
export function FundingNotice() {
  const { address, walletKind, nativeBalance, refreshBalance } = useWallet();
  const [dismissed, setDismissed] = useState(false);
  const [copied, setCopied] = useState(false);

  const visible = walletKind === 'privy' && Boolean(address) && needsFunding(nativeBalance) && !dismissed;

  useEffect(() => {
    if (!visible) return;
    const timer = window.setInterval(() => { void refreshBalance(); }, BALANCE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [visible, refreshBalance]);

  if (!visible || !address) return null;

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="funding-notice" role="status">
      <div className="funding-notice__text">
        <strong>Your new wallet needs test {env.nativeSymbol} to buy and retire.</strong>
        <code>{address}</code>
      </div>
      <div className="funding-notice__actions">
        <button type="button" onClick={copyAddress}>{copied ? 'Copied' : 'Copy address'}</button>
        <a href={TEST_AVAX_FAUCET_URL} target="_blank" rel="noreferrer">Get test {env.nativeSymbol} ↗</a>
        <button type="button" aria-label="Dismiss" onClick={() => setDismissed(true)}>×</button>
      </div>
    </div>
  );
}
