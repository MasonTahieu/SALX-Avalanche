import type { Listing } from '../../types/domain';
import { formatNumber } from '../../lib/format';
import { useLanguage } from '../../contexts/LanguageContext';
import { env } from '../../config/env';

interface StatTileProps {
  label: string;
  value: string;
  loading: boolean;
}

function StatTile({ label, value, loading }: StatTileProps) {
  return (
    <div className="market-hero-stat">
      <span>{label}</span>
      {loading
        ? <strong><span className="market-hero-stat__skeleton" /></strong>
        : <strong>{value}</strong>
      }
    </div>
  );
}

interface MarketplaceHeroProps {
  listings: Listing[];
  loading: boolean;
}

export function MarketplaceHero({ listings, loading }: MarketplaceHeroProps) {
  const { t } = useLanguage();

  const totalAvailableSAL = listings.reduce((sum, l) => sum + l.remainingAmount, 0);
  const prices = listings.map((l) => Number(l.pricePerUnitETH)).filter(Number.isFinite);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 0;
  const uniqueProjects = new Set(listings.map((l) => l.projectId)).size;

  const priceRangeLabel = prices.length
    ? `${minPrice.toFixed(4)}–${maxPrice.toFixed(4)} ${env.nativeSymbol}`
    : '—';

  return (
    <div className="sal-hero px-6 py-8 md:px-10 md:py-10">
      <div className="relative z-10">
        <p className="text-sm font-black uppercase tracking-widest" style={{ color: 'rgba(110,255,200,0.75)' }}>
          {t('market.eyebrow')}
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-white md:text-4xl">
          {t('market.title')}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 md:text-base" style={{ color: 'rgba(255,255,255,0.62)' }}>
          {t('market.desc')}
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label={t('market.liveListings')} value={String(listings.length)} loading={loading} />
          <StatTile label={t('market.projectsAvailable')} value={String(uniqueProjects)} loading={loading} />
          <StatTile label={t('market.availableSal')} value={`${formatNumber(totalAvailableSAL)} SAL`} loading={loading} />
          <StatTile label={t('market.priceRange')} value={priceRangeLabel} loading={loading} />
        </div>
      </div>
    </div>
  );
}
