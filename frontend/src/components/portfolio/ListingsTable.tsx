import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import type { Listing } from '../../types/domain';
import { env } from '../../config/env';

interface Props {
  listings: Listing[];
  busy: boolean;
  onCancel: (listingId: number) => void;
  t: (key: string) => string;
}

export function ListingsTable({ listings, busy, onCancel, t }: Props) {
  return (
    <div className="overflow-hidden rounded-[var(--sal-radius)] border border-[var(--sal-border)] bg-[var(--sal-surface)]">
      <div className="border-b border-[var(--sal-border)] px-5 py-4">
        <h2 className="text-lg font-black">{t('dashboard.listings')}</h2>
      </div>
      <div className="divide-y divide-[var(--sal-border)]">
        {listings.length === 0 ? (
          <div className="px-5 py-6 text-sm text-[var(--sal-muted)]">{t('dashboard.noListing')}</div>
        ) : (
          listings.map(l => (
            <div key={l.listingId} className="portfolio-row">
              <div className="min-w-0">
                <div className="font-black">Listing #{l.listingId}</div>
                <div className="mt-0.5 text-xs text-[var(--sal-muted)]">
                  Project #{l.projectId} · {l.remainingAmount} / {l.initialAmount} SAL · {l.pricePerUnitETH} {env.nativeSymbol}/SAL
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge tone={l.active ? 'success' : 'neutral'}>
                  {l.active ? 'Active' : 'Closed'}
                </Badge>
                {l.active && (
                  <Button variant="secondary" disabled={busy} onClick={() => onCancel(l.listingId)}>
                    {t('common.cancel')}
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
