import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import type { AccountFinance } from './usePortfolioData';
import { env } from '../../config/env';

interface Props {
  finance: AccountFinance | null;
  busy: boolean;
  onWithdrawProceeds: () => void;
  onWithdrawRefund: () => void;
  t: (key: string) => string;
}

export function FinanceCards({ finance, busy, onWithdrawProceeds, onWithdrawRefund, t }: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <FinanceCard
        label={t('dashboard.proceeds')}
        value={finance?.proceedsETH ?? '—'}
        unit={env.nativeSymbol}
        hint={t('dashboard.proceedsHint')}
        actionLabel={t('dashboard.withdraw')}
        disabled={busy || !Number(finance?.proceedsETH)}
        onAction={onWithdrawProceeds}
      />
      <FinanceCard
        label={t('dashboard.refund')}
        value={finance?.refundETH ?? '—'}
        unit={env.nativeSymbol}
        hint={t('dashboard.refundHint')}
        actionLabel={t('dashboard.withdraw')}
        disabled={busy || !Number(finance?.refundETH)}
        onAction={onWithdrawRefund}
      />
      <FinanceCard
        label={t('dashboard.mintFee')}
        value={finance?.certificateFeeETH ?? '—'}
        unit={env.nativeSymbol}
        hint="Certificate mint fee · contract view"
        readOnly
        warning={finance?.paused}
      />
    </div>
  );
}

interface FinanceCardProps {
  label: string;
  value: string;
  unit: string;
  hint: string;
  actionLabel?: string;
  disabled?: boolean;
  onAction?: () => void;
  readOnly?: boolean;
  warning?: boolean;
}

function FinanceCard({ label, value, unit, hint, actionLabel, disabled, onAction, readOnly, warning }: FinanceCardProps) {
  return (
    <Card className="p-5">
      <div className="text-sm font-semibold text-[var(--sal-muted)]">{label}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-black">{value}</span>
        <span className="text-sm font-semibold text-[var(--sal-muted)]">{unit}</span>
      </div>
      <div className="mt-1 text-xs text-[var(--sal-muted)]">{hint}</div>
      {warning && (
        <div className="mt-2 text-xs font-bold text-[var(--sal-warning)]">⚠ Marketplace paused</div>
      )}
      {!readOnly && actionLabel && (
        <Button className="mt-4 w-full" variant="secondary" disabled={disabled} onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </Card>
  );
}
