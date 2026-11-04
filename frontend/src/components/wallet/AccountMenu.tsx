import { useState } from 'react';
import { useWallet } from '../../contexts/WalletContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { shortAddress } from '../../lib/format';
import { networkById } from '../../config/networks';
import { env } from '../../config/env';
import { walletLabel } from '../../services/blockchain';

export function AccountMenu() {
  const wallet = useWallet();
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const network = networkById(wallet.chainId);
  const displayBalance = wallet.nativeBalance ? Number(wallet.nativeBalance).toFixed(4) : '—';
  const walletName = walletLabel(wallet.walletKind);

  const copyAddress = async () => {
    if (!wallet.address) return;
    try {
      await navigator.clipboard.writeText(wallet.address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return <div className="sal-account-menu">
    <button type="button" className="sal-account-close" onClick={wallet.closeAccountMenu} aria-label="Close">×</button>
    <div className="flex flex-col items-center px-5 pt-5">
      <div className="sal-account-avatar" aria-hidden="true">♟</div>
      <div className="mt-3 font-black">{shortAddress(wallet.address, 4, 4)}</div>
      <div className="mt-1 text-sm text-[var(--sal-muted)]">{displayBalance} {network?.symbol || env.nativeSymbol}</div>
      <div className={`mt-2 rounded-full px-2.5 py-1 text-[10px] font-black ${wallet.connected ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-600'}`}>
        {wallet.connected ? `${env.chainName} ready` : `${network?.name || `Chain ${wallet.chainId ?? '—'}`} · ${walletName}`.replace('$', '')}
      </div>
    </div>
    <div className="mt-5 grid grid-cols-2 gap-2 p-4">
      <button type="button" className="sal-account-action" onClick={copyAddress}>
        <span>⧉</span>
        <span>{copied ? 'Copied' : 'Copy Address'}</span>
      </button>
      <button type="button" className="sal-account-action" onClick={wallet.disconnect}>
        <span>↪</span>
        <span>{t('common.disconnect')}</span>
      </button>
    </div>
    {wallet.error && <div className="mx-4 mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-500">{wallet.error}</div>}
  </div>;
}
