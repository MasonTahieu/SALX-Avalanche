import { Link } from 'react-router-dom';
import { shortAddress, formatNumber } from '../../lib/format';
import type { AccountFinance } from './usePortfolioData';
import { env } from '../../config/env';

interface Props {
  address: string;
  totalSAL: number;
  certCount: number;
  finance: AccountFinance | null;
  t: (key: string) => string;
}

export function PortfolioHero({ address, totalSAL, certCount, finance, t }: Props) {
  return (
    <div className="sal-hero p-6 sm:p-8">
      <div className="text-xs font-black uppercase tracking-widest text-white/55">
        {t('dashboard.eyebrow')} / {shortAddress(address, 8, 6)}
      </div>
      <h1 className="mt-2 text-2xl font-black sm:text-3xl">{t('dashboard.title')}</h1>
      <p className="mt-2 max-w-xl text-sm text-white/70">{t('dashboard.desc')}</p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label={t('dashboard.totalSal')} value={`${formatNumber(totalSAL)} SAL`} />
        <StatTile label={t('dashboard.totalCarbon')} value={`${formatNumber(totalSAL * 10)} kg`} />
        <StatTile label={t('dashboard.proceeds')} value={finance ? `${finance.proceedsETH} ${env.nativeSymbol}` : '…'} />
        <StatTile label={t('dashboard.certificates')} value={String(certCount)} />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Link to="/retire">
          <button className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/15">
            {t('dashboard.retireCta')}
          </button>
        </Link>
        <Link to="/certificates">
          <button className="rounded-xl border border-white/10 bg-transparent px-4 py-2 text-sm font-bold text-white/65 transition hover:text-white">
            {t('dashboard.viewCertificates')}
          </button>
        </Link>
      </div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="market-hero-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
