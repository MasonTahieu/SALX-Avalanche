import type { RetireConfig } from './useRetireFlow';
import { env } from '../../config/env';

interface Props {
  config: RetireConfig;
  t: (key: string) => string;
}

export function RetireHero({ config, t }: Props) {
  return (
    <div className="sal-hero p-6 sm:p-8">
      <div className="text-xs font-black uppercase tracking-widest text-white/55">
        {t('retire.eyebrow')}
      </div>
      <h1 className="mt-2 text-2xl font-black sm:text-3xl">{t('retire.title')}</h1>
      <p className="mt-2 max-w-xl text-sm text-white/70">{t('retire.desc')}</p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label={t('retire.maxSources')} value={String(config.maxProjects)} />
        <StatTile label="SBT per basket" value="1" />
        <StatTile label={t('retire.fee')} value={config.feeETH === '—' ? '…' : `${config.feeETH} ${env.nativeSymbol}`} />
      </div>

      <p className="mt-4 text-xs text-white/45">
        {t('retire.ruleTitle')} ·{' '}
        {t('retire.ruleDesc').replace('{max}', String(config.maxProjects))}
      </p>
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
