import { useWallet } from '../../contexts/WalletContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { env } from '../../config/env';
import { walletLabel } from '../../services/blockchain';
import { shortAddress } from '../../lib/format';
import { Button } from '../ui/Button';

function WalletChoice({
  title,
  description,
  badge,
  onClick,
  disabled,
}: {
  title: string;
  description: string;
  badge: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="wallet-choice"
  >
    <span className="wallet-choice-icon">{badge}</span>
    <span className="min-w-0 flex-1 text-left">
      <span className="block font-black text-[var(--sal-text)]">{title}</span>
      <span className="mt-1 block text-xs text-[var(--sal-muted)]">{description}</span>
    </span>
    <span className="text-lg text-[var(--sal-muted)]">→</span>
  </button>;
}

export function WalletModal() {
  const wallet = useWallet();
  const { t } = useLanguage();
  if (!wallet.modalOpen) return null;

  return <div className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onMouseDown={wallet.closeWalletModal}>
    <div className="sal-modal w-full max-w-md" onMouseDown={e => e.stopPropagation()}>
      <div className="flex items-start justify-between gap-4 border-b border-[var(--sal-border)] p-5">
        <div>
          <div className="text-xs font-black uppercase tracking-[.18em] text-[var(--sal-primary)]">SALX Access</div>
          <h2 className="mt-1 text-2xl font-black">{wallet.address ? t('wallet.account') : t('wallet.title')}</h2>
          {!wallet.address && <p className="mt-2 text-sm leading-6 text-[var(--sal-muted)]">{t('wallet.subtitle')}</p>}
        </div>
        <button type="button" className="icon-button" onClick={wallet.closeWalletModal} aria-label={t('common.close')}>×</button>
      </div>

      <div className="p-5">
        {wallet.address ? <div className="space-y-4">
          <div className="rounded-2xl border border-[var(--sal-border)] bg-[var(--sal-surface-soft)] p-4">
            <div className="text-xs uppercase tracking-wider text-[var(--sal-muted)]">{walletLabel(wallet.walletKind)}</div>
            <div className="mt-2 font-mono text-lg font-black">{shortAddress(wallet.address, 8, 6)}</div>
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-[var(--sal-muted)]">{t('wallet.network')}</span>
              <span className={wallet.chainId === env.chainId ? 'text-emerald-500' : 'text-amber-500'}>{wallet.chainId === env.chainId ? env.chainName : `Chain ${wallet.chainId ?? '—'}`}</span>
            </div>
          </div>
          <Button className="w-full" variant="secondary" onClick={wallet.disconnect}>{t('common.disconnect')}</Button>
        </div> : <div className="space-y-3">
          <WalletChoice
            title={t('wallet.core')}
            description={t('wallet.browserExtension')}
            badge="▲"
            onClick={() => wallet.connect('core')}
            disabled={wallet.connecting}
          />
          <WalletChoice
            title={t('wallet.metamask')}
            description={t('wallet.browserExtension')}
            badge="M"
            onClick={() => wallet.connect('metamask')}
            disabled={wallet.connecting}
          />
          <WalletChoice
            title={t('wallet.coin98')}
            description={t('wallet.browserExtension')}
            badge="98"
            onClick={() => wallet.connect('coin98')}
            disabled={wallet.connecting}
          />
          {wallet.connecting && <div className="text-center text-sm text-[var(--sal-muted)]">{t('common.processing')}</div>}
          {wallet.error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">{wallet.error}</div>}
        </div>}
      </div>
    </div>
  </div>;
}
