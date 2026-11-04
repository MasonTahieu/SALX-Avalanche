import { useMemo } from 'react';
import type { Listing, Project } from '../../types/domain';
import { formatNumber, salToKg, shortAddress } from '../../lib/format';
import { ipfsToHttp, projectDisplay, projectMetadataIsValid } from '../../lib/projectMeta';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { useLanguage } from '../../contexts/LanguageContext';
import { product } from '../../config/product';
import { useBuyListing } from './useBuyListing';
import { env } from '../../config/env';

const PLATFORM_FEE_PCT = '2%';

interface SupplyBarProps {
  remaining: number;
  initial: number;
}

function SupplyBar({ remaining, initial }: SupplyBarProps) {
  const pct = initial > 0 ? Math.round((remaining / initial) * 100) : 0;
  return (
    <div className="market-supply-bar" aria-label={`${pct}% supply remaining`}>
      <div className="market-supply-bar__fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

interface BlacklistBannerProps {
  reason?: string | null;
}

function BlacklistBanner({ reason }: BlacklistBannerProps) {
  return (
    <div className="rounded-xl bg-red-500/10 px-4 py-3 text-center">
      <p className="text-xs font-bold text-red-500">Project blacklisted — buying disabled.</p>
      {reason && <p className="mt-1 text-[11px] text-red-400/80">{reason}</p>}
    </div>
  );
}

export interface ListingCardProps {
  listing: Listing;
  project?: Project;
  onChanged: () => void;
}

export function ListingCard({ listing, project, onChanged }: ListingCardProps) {
  const { t } = useLanguage();
  const { amount, setAmount, buy, busy, isWalletConnected, message } = useBuyListing(listing, onChanged);

  const details = projectDisplay(project);
  const image = ipfsToHttp(details.image);
  const priceETH = Number(listing.pricePerUnitETH || 0);
  const tonnePrice = priceETH * (1000 / product.fallbackKgPerSAL);
  const totalCost = priceETH * amount;
  const isBlacklisted = project?.blacklisted ?? false;
  const canBuy = listing.active && !isBlacklisted && amount <= listing.remainingAmount;

  const tags = useMemo(
    () => [details.projectType, details.location, details.methodology].filter(Boolean).slice(0, 3),
    [details],
  );

  const buyButtonLabel = busy
    ? t('market.buying')
    : isWalletConnected
      ? t('market.buy')
      : t('common.connectWallet');

  return (
    <Card className="market-listing-card flex h-full flex-col overflow-hidden p-0">
      {/* Cover image */}
      <div className="market-project-cover">
        {image
          ? <img src={image} alt={project?.projectName || `Project #${listing.projectId}`} />
          : (
            <div className="market-project-placeholder">
              <span>SALX</span>
              <small>PROJECT #{listing.projectId}</small>
            </div>
          )
        }
        <div className="absolute left-4 top-4 flex flex-wrap gap-2">
          <Badge tone={listing.active ? 'success' : 'neutral'}>
            {listing.active ? t('market.active') : t('market.closed')}
          </Badge>
          {isBlacklisted && <Badge tone="danger">Blacklisted</Badge>}
          {!isBlacklisted && projectMetadataIsValid(project) && (
            <Badge tone="success">{t('market.metadataValid')}</Badge>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">
        {/* Project name + price header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-wider text-[var(--sal-muted)]">
              #{listing.projectId}
            </div>
            <h3 className="mt-1 line-clamp-2 text-lg font-black leading-snug">
              {project?.projectName || `SAL Project #${listing.projectId}`}
            </h3>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[10px] text-[var(--sal-muted)]">{t('market.pricePerSal')}</div>
            <div className="text-lg font-black text-[var(--sal-primary)]">{listing.pricePerUnitETH} {env.nativeSymbol}</div>
            <div className="text-[10px] text-[var(--sal-muted)]">{tonnePrice.toFixed(4)} {env.nativeSymbol}/tCO₂e</div>
          </div>
        </div>

        {details.description && (
          <p className="mt-3 line-clamp-2 text-sm leading-6 text-[var(--sal-muted)]">
            {details.description}
          </p>
        )}

        {tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tags.map((tag) => <span key={tag} className="sal-meta-pill">{tag}</span>)}
          </div>
        )}

        {/* Supply bar */}
        <div className="mt-4">
          <div className="mb-1.5 flex justify-between text-[10px] font-bold text-[var(--sal-muted)]">
            <span>{t('market.remaining')}</span>
            <span>
              {formatNumber(listing.remainingAmount)} / {formatNumber(listing.initialAmount)} SAL
            </span>
          </div>
          <SupplyBar remaining={listing.remainingAmount} initial={listing.initialAmount} />
        </div>

        {/* Metrics */}
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div className="market-metric">
            <span>{t('market.carbonAvailable')}</span>
            <b>{formatNumber(salToKg(listing.remainingAmount))} kg</b>
          </div>
          <div className="market-metric">
            <span>{t('market.seller')}</span>
            <b>{shortAddress(listing.sellerAddress)}</b>
          </div>
        </div>

        {/* Buy section */}
        <div className="mt-auto border-t border-[var(--sal-border)] pt-4">
          {isBlacklisted ? (
            <BlacklistBanner reason={project?.blacklistReason} />
          ) : (
            <>
              <div className="flex items-end gap-3">
                <div className="min-w-0 flex-1">
                  <label className="sal-label">{t('market.buyAmount')}</label>
                  <input
                    className="sal-input"
                    type="number"
                    min={1}
                    max={listing.remainingAmount}
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value || 1))}
                  />
                </div>
                <div className="pb-2 text-right text-xs text-[var(--sal-muted)]">
                  <div>{formatNumber(salToKg(amount))} kg CO₂e</div>
                  <b className="text-[var(--sal-text)]">{totalCost.toFixed(6)} {env.nativeSymbol}</b>
                </div>
              </div>

              <Button className="mt-4 w-full" onClick={buy} disabled={busy || !canBuy}>
                {buyButtonLabel}
              </Button>

              <div className="mt-2 flex items-center justify-between text-[10px] text-[var(--sal-muted)]">
                <span>{t('market.buyHint')}</span>
                <span className="ml-2 shrink-0 font-bold">{PLATFORM_FEE_PCT} platform fee</span>
              </div>
            </>
          )}

          {message && (
            <div className="mt-3 break-all text-xs text-[var(--sal-muted)]">{message}</div>
          )}
        </div>
      </div>
    </Card>
  );
}
