import type { ReactNode } from 'react';
import { formatNumber } from '../../lib/format';
import { useLanguage } from '../../contexts/LanguageContext';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { env } from '../../config/env';

export function RetirementSummary({
  selectedCount,
  maxProjects,
  totalSAL,
  kgPerSAL,
  feeETH,
  disabled,
  busy,
  onSubmit,
  children,
}: {
  selectedCount: number;
  maxProjects: number;
  totalSAL: number;
  kgPerSAL: number;
  feeETH: string;
  disabled: boolean;
  busy: boolean;
  onSubmit: () => void;
  children?: ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <Card className="lg:sticky lg:top-24 lg:self-start">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-black">{t('retire.summary')}</h2>
        <span className="text-xs font-black text-[var(--sal-primary)]">{selectedCount} / {maxProjects}</span>
      </div>
      <div className="mt-5 space-y-4 text-sm">
        <div className="flex justify-between gap-4"><span className="text-[var(--sal-muted)]">{t('retire.selectedSources')}</span><b>{selectedCount}</b></div>
        <div className="flex justify-between gap-4"><span className="text-[var(--sal-muted)]">{t('retire.totalSal')}</span><b>{formatNumber(totalSAL)} SAL</b></div>
        <div className="flex justify-between gap-4"><span className="text-[var(--sal-muted)]">{t('retire.carbon')}</span><b className="text-[var(--sal-primary)]">{formatNumber(totalSAL * kgPerSAL)} kg CO₂e</b></div>
        <div className="flex justify-between gap-4"><span className="text-[var(--sal-muted)]">{t('retire.fee')}</span><b>{feeETH} {env.nativeSymbol}</b></div>
      </div>
      <div className="mt-5 rounded-xl border border-[var(--sal-border)] bg-[var(--sal-surface-soft)] p-3 text-xs leading-5 text-[var(--sal-muted)]">
        {t('retire.oneSbtNote')}
      </div>
      <Button className="mt-5 w-full" disabled={disabled || busy} onClick={onSubmit}>
        {busy ? t('common.processing') : t('retire.action')}
      </Button>
      {children}
    </Card>
  );
}
