import { useRef, useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useWallet } from '../contexts/WalletContext';
import { WalletButton } from '../components/wallet/WalletButton';
import { usePortfolioData } from '../components/portfolio/usePortfolioData';
import { formatDate } from '../lib/format';
import type { Certificate } from '../types/domain';
import { CertificatesPage } from './CertificatesPage';
import { env } from '../config/env';

const MONO = "'JetBrains Mono', monospace";
const SYNE = "'Syne', sans-serif";

function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add('is-visible'); obs.disconnect(); } },
      { threshold: 0.08 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} className="dc-reveal" style={delay ? { animationDelay: `${delay}ms` } : undefined}>
      {children}
    </div>
  );
}

function StatCard({ label, value, unit, sub, action, onAction, actionColor = 'var(--org)' }: {
  label: string; value: string | number; unit?: string; sub?: string;
  action?: string; onAction?: () => void; actionColor?: string;
}) {
  return (
    <div style={{ background: 'var(--surf)', border: '1px solid var(--bd-mid)', borderRadius: 10, padding: 16 }}>
      <span style={{ display: 'block', fontFamily: MONO, fontSize: 7, letterSpacing: '.13em', textTransform: 'uppercase', color: 'var(--mut)', marginBottom: 10 }}>{label}</span>
      <div>
        <strong style={{ fontSize: 22, fontWeight: 700, color: label === 'SAL BALANCE' ? 'var(--g)' : 'var(--ink)', letterSpacing: '-.02em' }}>{value}</strong>
        {unit && <span style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mut)', marginLeft: 6 }}>{unit}</span>}
      </div>
      {sub && <div style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mut)', marginTop: 4 }}>{sub}</div>}
      {action && onAction && (
        <button
          onClick={onAction}
          style={{ display: 'block', marginTop: 8, fontFamily: MONO, fontSize: 7, letterSpacing: '.08em', textTransform: 'uppercase', background: actionColor, color: '#fff', border: 'none', borderRadius: 4, padding: '4px 8px', cursor: 'pointer' }}
        >
          {action}
        </button>
      )}
    </div>
  );
}

function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
      <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--mut)' }}>{children}</span>
      {right}
    </div>
  );
}

const TX_COLORS: Record<string, { bg: string; color: string }> = {
  PURCHASE:  { bg: 'rgba(45,201,34,.12)',   color: 'var(--g)' },
  SALE:      { bg: 'rgba(231,199,101,.12)', color: 'var(--gold)' },
  RETIRE:    { bg: 'rgba(232,145,60,.12)',  color: 'var(--org)' },
  LISTING:   { bg: 'rgba(158,165,168,.1)',  color: 'var(--mut)' },
  MINT:      { bg: 'rgba(45,201,34,.08)',   color: 'var(--g)' },
};
function txStyle(type?: string) {
  return TX_COLORS[type?.toUpperCase() ?? ''] ?? { bg: 'rgba(158,165,168,.1)', color: 'var(--mut)' };
}

function CertBadge({ status }: { status: Certificate['status'] }) {
  const map = {
    ACTIVE:  { c: 'var(--g)',    bg: 'rgba(45,201,34,.1)',    border: 'rgba(45,201,34,.27)' },
    REVOKED: { c: '#e05252',     bg: 'rgba(224,82,82,.1)',    border: 'rgba(224,82,82,.27)' },
    PENDING: { c: 'var(--gold)', bg: 'rgba(231,199,101,.12)', border: 'rgba(231,199,101,.27)' },
    EXPIRED: { c: 'var(--mut)',  bg: 'rgba(158,165,168,.1)',  border: 'rgba(158,165,168,.2)' },
  };
  const s = map[status] ?? map.PENDING;
  return (
    <span style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.1em', padding: '3px 8px', borderRadius: 4, background: s.bg, color: s.c, border: `1px solid ${s.border}` }}>{status}</span>
  );
}

export function PortfolioPage() {
  const wallet = useWallet();
  const data = usePortfolioData();
  const [showCreateFor, setShowCreateFor] = useState<number | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') === 'certificates' ? 'certificates' : 'portfolio';

  const addr = wallet.address ?? '';
  const shortAddr = addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '';

  const handleCreateListing = async () => {
    await data.runCreateListing();
    setShowCreateFor(null);
  };

  const switchTab = (tab: 'portfolio' | 'certificates') => {
    if (tab === 'portfolio') {
      searchParams.delete('tab');
      setSearchParams(searchParams, { replace: true });
    } else {
      setSearchParams({ tab }, { replace: true });
    }
  };

  return (
    <div className="home-dc" style={{ animation: 'fadeUp .35s ease' }}>
      <div className="home-dc-section" style={{ padding: '38px 34px 80px' }}>

        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--mut)' }}>{shortAddr ? `DASHBOARD / ${shortAddr}` : 'DASHBOARD'}</span>
          <h1 style={{ fontFamily: SYNE, fontWeight: 800, fontSize: 'clamp(32px,4vw,52px)', lineHeight: 1, letterSpacing: '-.02em', margin: '10px 0 0', color: 'var(--ink)' }}>My Dashboard</h1>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 28, background: 'var(--surf)', border: '1px solid var(--bd-mid)', borderRadius: 8, padding: 4, width: 'fit-content' }}>
          {(['portfolio', 'certificates'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => switchTab(tab)}
              style={{
                fontFamily: MONO, fontSize: 8, letterSpacing: '.1em', textTransform: 'uppercase',
                padding: '7px 16px', borderRadius: 5, border: 'none', cursor: 'pointer',
                background: activeTab === tab ? 'var(--g)' : 'transparent',
                color: activeTab === tab ? '#08150e' : 'var(--mut)',
                fontWeight: activeTab === tab ? 700 : 400,
                transition: 'background .15s ease, color .15s ease',
              }}
            >
              {tab === 'portfolio' ? 'Portfolio' : 'Certificates'}
            </button>
          ))}
        </div>

        {/* Certificates tab — self-contained page component */}
        {activeTab === 'certificates' && <CertificatesPage />}

        {/* Portfolio tab content */}
        {activeTab === 'portfolio' && <>

        {/* Inline connect prompt — shown only when disconnected */}
        {!wallet.address && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--surf)', border: '1px solid var(--bd-mid)', borderRadius: 10, padding: '14px 18px', marginBottom: 24 }}>
            <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mut)', letterSpacing: '.06em', flex: 1 }}>Connect your wallet to see balances, listings, and certificates.</span>
            <WalletButton />
          </div>
        )}

        {/* Stat cards */}
        <Reveal>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 28 }}>
            <StatCard label="SAL BALANCE" value={data.totalSAL} unit="SAL" sub={`= ${data.totalSAL * 10} kg CO₂e`} />
            <StatCard
              label="PROCEEDS"
              value={data.finance?.proceedsETH ?? '0.000'}
              unit={env.nativeSymbol}
              action="WITHDRAW"
              onAction={data.runWithdrawProceeds}
            />
            <StatCard
              label="FEE REFUND"
              value={data.finance?.refundETH ?? '0.000'}
              unit={env.nativeSymbol}
              action="CLAIM"
              onAction={data.runWithdrawRefund}
              actionColor='var(--surf2)'
            />
            <StatCard label="CERTIFICATES" value={data.certificates.length} sub="SBT minted" />
          </div>
        </Reveal>

        {/* Status message */}
        {data.message && (
          <div style={{ fontFamily: MONO, fontSize: 10, color: data.messageIsError ? '#e05252' : 'var(--g)', padding: '10px 14px', background: 'var(--surf)', border: `1px solid ${data.messageIsError ? 'rgba(224,82,82,.3)' : 'rgba(45,201,34,.3)'}`, borderRadius: 8, marginBottom: 18, wordBreak: 'break-all', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {data.message}
            <button onClick={data.clearMessage} style={{ background: 'none', border: 'none', color: 'var(--mut)', cursor: 'pointer', fontFamily: MONO, fontSize: 9, marginLeft: 12 }}>✕</button>
          </div>
        )}

        {/* Pending projects */}
        {data.myPending.length > 0 && (
          <Reveal>
            <div style={{ marginBottom: 26 }}>
              <SectionLabel>MY PENDING PROJECTS</SectionLabel>
              <div style={{ border: '1px solid var(--bd-mid)', borderRadius: 10, overflow: 'hidden' }}>
                {data.myPending.map((p, i) => (
                  <div key={p._id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 20, padding: '14px 16px', borderBottom: i < data.myPending.length - 1 ? '1px solid var(--bd-mid)' : 'none' }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>{p.projectName}</div>
                      <div style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mut)', marginTop: 2 }}>Pending review · {p.proposedCO2Kg ?? '—'} kg CO₂</div>
                    </div>
                    <button
                      disabled={data.busy}
                      onClick={() => p.onChainProjectId != null && data.runCancelPending(p.onChainProjectId)}
                      style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.08em', background: 'rgba(204,12,0,.08)', border: '1px solid rgba(204,12,0,.25)', color: '#ff6b5b', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', opacity: data.busy ? .5 : 1 }}
                    >
                      CANCEL
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        )}

        {/* SAL balances */}
        <Reveal delay={40}>
          <div style={{ marginBottom: 26 }}>
            <SectionLabel right={
              <a href="/marketplace" style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--g)', textDecoration: 'none' }}>+ BUY MORE ↗</a>
            }>SAL BALANCES BY PROJECT</SectionLabel>
            <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.06em', color: 'var(--mut)', marginBottom: 12, lineHeight: 1.6 }}>
              To sell in the Marketplace, click <strong style={{ color: 'var(--g)' }}>LIST ↗</strong> on a project row and confirm the listing.
            </div>

            {data.loading ? (
              <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mut)', padding: '28px 0', textAlign: 'center', letterSpacing: '.08em' }}>LOADING…</div>
            ) : data.balances.length === 0 ? (
              <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mut)', padding: '28px 0', textAlign: 'center', letterSpacing: '.08em' }}>NO SAL TOKENS HELD</div>
            ) : (
              <div style={{ border: '1px solid var(--bd-mid)', borderRadius: 10, overflow: 'hidden' }}>
                {data.balances.map((row, i) => (
                  <div key={row.project._id}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', alignItems: 'center', gap: 20, padding: '14px 16px', borderBottom: '1px solid var(--bd-mid)' }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>{row.project.projectName}</div>
                        <div style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mut)', marginTop: 2 }}>Project ID: {row.project.onChainProjectId}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: 'var(--g)' }}>{row.balance} SAL</div>
                        <div style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mut)' }}>{row.balance * 10} kg CO₂e</div>
                      </div>
                      <span style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mut)' }}> </span>
                      <button
                        onClick={() => {
                          const next = showCreateFor === row.project.onChainProjectId ? null : row.project.onChainProjectId!;
                          setShowCreateFor(next);
                          if (next !== null) {
                            data.setSelectedProjectId(next);
                            data.setListAmount(1);
                            data.setListPrice('0.001');
                          }
                        }}
                        style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.08em', background: 'var(--surf2)', border: '1px solid var(--bd-mid)', color: 'var(--mut)', borderRadius: 6, padding: '6px 10px', cursor: 'pointer' }}
                      >
                        LIST ↗
                      </button>
                    </div>
                    {/* Inline create listing panel */}
                    {showCreateFor === row.project.onChainProjectId && (
                      <div style={{ background: 'var(--surf2)', borderBottom: '1px solid var(--bd-mid)', padding: '14px 16px', display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.1em', color: 'var(--mut)', marginBottom: 4 }}>AMOUNT (SAL) — held: {row.balance}</div>
                          <input type="number" min={1} max={row.balance} value={data.listAmount} onChange={e => data.setListAmount(Number(e.target.value))}
                            style={{ width: 80, fontFamily: MONO, fontSize: 11, background: 'var(--surf)', border: '1px solid var(--bd-mid)', borderRadius: 6, padding: '6px 10px', color: 'var(--ink)', outline: 'none' }} />
                        </div>
                        <div>
                          <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.1em', color: 'var(--mut)', marginBottom: 4 }}>PRICE / SAL ({env.nativeSymbol})</div>
                          <input type="text" value={data.listPrice} onChange={e => data.setListPrice(e.target.value)}
                            style={{ width: 110, fontFamily: MONO, fontSize: 11, background: 'var(--surf)', border: '1px solid var(--bd-mid)', borderRadius: 6, padding: '6px 10px', color: 'var(--ink)', outline: 'none' }} />
                        </div>
                        {row.balance === 0 ? (
                          <span style={{ fontFamily: MONO, fontSize: 8, color: '#e05252', alignSelf: 'center' }}>
                            No SAL tokens to list — tokens may not have been minted to this wallet
                          </span>
                        ) : (
                          <button
                            disabled={data.busy || data.listAmount <= 0 || data.listAmount > row.balance}
                            onClick={handleCreateListing}
                            style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.1em', padding: '7px 16px', borderRadius: 6, background: 'rgba(45,201,34,.13)', border: '1px solid rgba(45,201,34,.4)', color: 'var(--g)', cursor: 'pointer', opacity: (data.busy || data.listAmount <= 0 || data.listAmount > row.balance) ? .4 : 1 }}
                          >
                            CONFIRM LIST
                          </button>
                        )}
                        <button onClick={() => setShowCreateFor(null)} style={{ fontFamily: MONO, fontSize: 8, background: 'none', border: 'none', color: 'var(--mut)', cursor: 'pointer' }}>✕</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Reveal>

        {/* Active listings */}
        {data.listings.length > 0 && (
          <Reveal delay={60}>
            <div style={{ marginBottom: 26 }}>
              <SectionLabel>ACTIVE LISTINGS</SectionLabel>
              {data.listings.map(l => (
                <div key={l.listingId} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', alignItems: 'center', gap: 20, padding: '14px 16px', background: 'var(--surf)', border: '1px solid var(--bd-mid)', borderRadius: 10, marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>{l.projectName ?? `Project #${l.projectId}`}</div>
                    <div style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mut)', marginTop: 2 }}>Listing #{l.listingId}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--ink)' }}>{l.remainingAmount ?? l.tokenAmount} / {l.tokenAmount} SAL</div>
                    <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--g)' }}>{l.pricePerToken} {env.nativeSymbol} / SAL</div>
                  </div>
                  <span style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.08em', color: 'var(--g)', background: 'rgba(45,201,34,.1)', border: '1px solid rgba(45,201,34,.25)', borderRadius: 4, padding: '3px 8px' }}>ACTIVE</span>
                  <button
                    disabled={data.busy}
                    onClick={() => data.runCancelListing(l.listingId)}
                    style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.08em', background: 'rgba(204,12,0,.08)', border: '1px solid rgba(204,12,0,.25)', color: '#ff6b5b', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', opacity: data.busy ? .5 : 1 }}
                  >
                    CANCEL
                  </button>
                </div>
              ))}
            </div>
          </Reveal>
        )}

        {/* Certificates inline */}
        {data.certificates.length > 0 && (
          <Reveal delay={80}>
            <div style={{ marginBottom: 26 }}>
              <SectionLabel>RETIREMENT CERTIFICATES (SBT)</SectionLabel>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
                {data.certificates.map(cert => (
                  <div key={cert.certificateTokenId} style={{ background: 'var(--surf)', border: '1px solid var(--bd-mid)', borderRadius: 10, padding: '16px 18px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <span style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mut)', letterSpacing: '.06em' }}>SBT #{cert.certificateTokenId}</span>
                      <CertBadge status={cert.status} />
                    </div>
                    <div style={{ fontFamily: SYNE, fontWeight: 700, fontSize: 15, color: 'var(--ink)', marginBottom: 4 }}>{cert.projectName ?? `Project #${cert.projectId}`}</div>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--g)', marginBottom: 8 }}>{cert.retiredCO2Kg} kg CO₂ retired</div>
                    {cert.sources && cert.sources.length > 1 && (
                      <div style={{ marginBottom: 8 }}>
                        {cert.sources.map(src => (
                          <div key={src.projectId} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontSize: 8, color: 'var(--mut)', padding: '2px 0' }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%', color: 'var(--mut)' }}>{src.projectName}</span>
                            <span style={{ color: 'var(--mut)' }}>{src.retiredCO2Kg} kg</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mut)' }}>{cert.mintedAt ? formatDate(cert.mintedAt) : '—'}</div>
                    {cert.explorerURL && (
                      <a href={cert.explorerURL} target="_blank" rel="noreferrer" style={{ display: 'block', marginTop: 8, fontFamily: MONO, fontSize: 8, letterSpacing: '.06em', color: 'var(--g)', textDecoration: 'none' }}>VIEW ON-CHAIN ↗</a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        )}

        {/* Recent activity */}
        <Reveal delay={100}>
          <div style={{ borderTop: '1px solid var(--bd-mid)', paddingTop: 18 }}>
            <SectionLabel right={
              <a href="/activity" style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.08em', background: 'none', color: 'var(--g)', textDecoration: 'none' }}>VIEW ALL ↗</a>
            }>RECENT ACTIVITY</SectionLabel>
            <div style={{ border: '1px solid var(--bd-mid)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mut)', padding: '28px 16px', textAlign: 'center', letterSpacing: '.08em' }}>
                Activity data available in full on the <a href="/activity" style={{ color: 'var(--g)', textDecoration: 'none' }}>Activity</a> page.
              </div>
            </div>
          </div>
        </Reveal>

        </>}

      </div>

      <div style={{ borderTop: '1px solid var(--bd-soft)', fontFamily: MONO, fontSize: 7, letterSpacing: '.13em', textTransform: 'uppercase', color: 'var(--faint)', padding: '20px 34px', textAlign: 'center' }}>
        © 2026 SALX | SAOLA CARBON MARKETPLACE. POWERED BY AVALANCHE.
      </div>
    </div>
  );
}
