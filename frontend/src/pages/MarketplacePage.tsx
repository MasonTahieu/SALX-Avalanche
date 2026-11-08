import { useCallback, useEffect, useMemo, useState } from 'react';
import { backend } from '../services/backend';
import type { Listing, Project } from '../types/domain';
import { MarketDcFilters } from '../components/marketplace/MarketDcFilters';
import { MarketDcCard } from '../components/marketplace/MarketDcCard';
import { useMarketFilters, applyDcFilters, deriveFilterOptions } from '../components/marketplace/useMarketFilters';

const SKELETON_COUNT = 6;
const MONO = "'JetBrains Mono', monospace";
const SYNE = "'Syne', sans-serif";

function DcCardSkeleton() {
  return (
    <div aria-hidden="true" style={{ background: 'var(--surf)', border: '1px solid var(--bd)', borderRadius: 12, padding: 10 }}>
      <div className="market-dc-skeleton-cover" />
      {/* Same rows and heights as MarketDcCard, so the page doesn't jump on load. */}
      <div style={{ paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="market-dc-skeleton-line" style={{ height: 34, width: '80%' }} />
        <div className="market-dc-skeleton-line" style={{ height: 31, width: '60%' }} />
        <div className="market-dc-skeleton-line" style={{ height: 29, width: '45%' }} />
        <div className="market-dc-skeleton-line" style={{ height: 26, width: '100%' }} />
        <div className="market-dc-skeleton-line" style={{ height: 38, width: '100%' }} />
      </div>
    </div>
  );
}

export function MarketplacePage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const { pending, updatePending, active, apply, clear } = useMarketFilters();

  // Skeletons only on the first load or a retry. A refresh after a purchase
  // (refresh = true) keeps the current cards on screen and swaps the data in.
  const load = useCallback(async (refresh = false) => {
    if (!refresh) setLoading(true);
    try {
      const [listingRows, projectRows] = await Promise.all([
        backend.listings({ active: true }),
        backend.projects('approved'),
      ]);
      setListings(listingRows);
      setProjects(projectRows);
      setLoadError(false);
    } catch {
      // A failed background refresh keeps the cards already shown.
      if (!refresh) setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  const refresh = useCallback(() => load(true), [load]);

  // O(1) project lookup by onChainProjectId
  const projectMap = useMemo(
    () => new Map(projects.map((p) => [p.onChainProjectId, p])),
    [projects],
  );

  // O(n) options derived from real project data
  const { types, geos } = useMemo(() => deriveFilterOptions(projects), [projects]);

  // O(n) filter pass against active (committed) filters
  const filtered = useMemo(
    () => applyDcFilters(listings, projectMap, active),
    [listings, projectMap, active],
  );

  return (
    <div className="home-dc" style={{ animation: 'fadeUp .35s ease' }}>
      <div className="home-dc-section" style={{ padding: '38px 34px 80px' }}>

        {/* Page header */}
        <div style={{ paddingTop: 24, paddingBottom: 34 }}>
          <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--mut)' }}>
            MARKET / VERIFIED PROJECTS
          </span>
          <h1 style={{ fontFamily: SYNE, fontWeight: 800, fontSize: 'clamp(40px,5vw,60px)', lineHeight: 1.03, letterSpacing: '-.02em', margin: '12px 0 0', color: 'var(--ink)' }}>
            Active Carbon Projects
          </h1>
          <p style={{ fontSize: 11, color: 'var(--mut)', margin: '12px 0 0' }}>
            Verified VCS and Gold Standard certified projects
          </p>
        </div>

        {/* Sidebar + grid layout */}
        <div className="market-dc-layout">
          <MarketDcFilters
            types={types}
            geos={geos}
            pending={pending}
            onType={(v) => updatePending({ projectType: v })}
            onGeo={(v) => updatePending({ geography: v })}
            onVintage={(v) => updatePending({ vintage: v })}
            onApply={apply}
            onClear={clear}
          />

          <section>
            {loading ? (
              <div className="market-dc-grid">
                {Array.from({ length: SKELETON_COUNT }, (_, i) => <DcCardSkeleton key={i} />)}
              </div>
            ) : loadError ? (
              <div style={{ padding: '60px 0', textAlign: 'center', fontFamily: MONO, fontSize: 10, color: 'var(--mut)', letterSpacing: '.08em' }}>
                <div>COULD NOT LOAD THE MARKETPLACE. THE SERVER MAY BE STARTING.</div>
                <button
                  type="button"
                  onClick={() => load()}
                  style={{ marginTop: 16, fontFamily: MONO, fontSize: 10, letterSpacing: '.08em', padding: '9px 16px', borderRadius: 6, border: '1px solid var(--bd-str)', background: 'transparent', color: 'var(--ink)', cursor: 'pointer' }}
                >
                  TRY AGAIN
                </button>
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: '60px 0', textAlign: 'center', fontFamily: MONO, fontSize: 10, color: 'var(--mut)', letterSpacing: '.08em' }}>
                NO PROJECTS MATCH YOUR FILTERS
              </div>
            ) : (
              <div className="market-dc-grid">
                {filtered.map((listing) => (
                  <MarketDcCard
                    key={listing.listingId}
                    listing={listing}
                    project={projectMap.get(listing.projectId)}
                    onChanged={refresh}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Footer */}
      <div style={{ borderTop: '1px solid var(--bd-soft)', fontFamily: MONO, fontSize: 7, letterSpacing: '.13em', textTransform: 'uppercase', color: 'var(--faint)', padding: '20px 34px', textAlign: 'center' }}>
        © 2026 SALX | SAOLA CARBON MARKETPLACE. POWERED BY AVALANCHE.
      </div>
    </div>
  );
}
