import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { backend } from '../services/backend';
import { useWallet } from '../contexts/WalletContext';
import { formatDate } from '../lib/format';
import type { TransactionEvent } from '../types/domain';

const MONO = "'JetBrains Mono', monospace";
const SYNE = "'Syne', sans-serif";

const TX_STYLES: Record<string, { bg: string; color: string }> = {
  PURCHASE:  { bg: 'rgba(45,201,34,.12)',   color: 'var(--g)' },
  SALE:      { bg: 'rgba(231,199,101,.12)', color: 'var(--gold)' },
  RETIRE:    { bg: 'rgba(232,145,60,.12)',  color: 'var(--org)' },
  LISTING:   { bg: 'rgba(158,165,168,.1)',  color: 'var(--mut)' },
  MINT:      { bg: 'rgba(45,201,34,.08)',   color: 'var(--g)' },
  CANCEL:    { bg: 'rgba(204,12,0,.08)',    color: '#ff6b5b' },
};

function txStyle(type?: string) {
  return TX_STYLES[type?.toUpperCase() ?? ''] ?? { bg: 'rgba(158,165,168,.1)', color: 'var(--mut)' };
}

const ALL_TYPES = ['ALL', 'PURCHASE', 'SALE', 'RETIRE', 'LISTING', 'MINT', 'CANCEL'];

function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add('is-visible'); obs.disconnect(); } },
      { threshold: 0.06 },
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

export function ActivityPage() {
  const wallet = useWallet();
  const [txs, setTxs] = useState<TransactionEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState('ALL');

  useEffect(() => {
    if (!wallet.address) return;
    setLoading(true);
    backend.transactions(wallet.address)
      .then(setTxs)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [wallet.address]);

  const filtered = useMemo(() => {
    if (activeFilter === 'ALL') return txs;
    return txs.filter(tx => (tx.transactionType ?? '').toUpperCase() === activeFilter);
  }, [txs, activeFilter]);

  return (
    <div className="home-dc" style={{ animation: 'fadeUp .35s ease' }}>
      <div className="home-dc-section" style={{ padding: '38px 34px 80px' }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--mut)' }}>ACTIVITY / TRANSACTION HISTORY</span>
          <h1 style={{ fontFamily: SYNE, fontWeight: 800, fontSize: 'clamp(32px,4vw,52px)', lineHeight: 1, letterSpacing: '-.02em', margin: '10px 0 0', color: 'var(--ink)' }}>Activity</h1>
        </div>

        {/* Filter chips */}
        <Reveal>
          <div style={{ display: 'flex', gap: 8, marginBottom: 22, flexWrap: 'wrap' }}>
            {ALL_TYPES.map(type => {
              const active = activeFilter === type;
              const style = txStyle(type === 'ALL' ? undefined : type);
              return (
                <button
                  key={type}
                  onClick={() => setActiveFilter(type)}
                  style={{
                    fontFamily: MONO, fontSize: 8, letterSpacing: '.08em', textTransform: 'uppercase',
                    padding: '7px 13px', borderRadius: 6, cursor: 'pointer',
                    background: active ? style.bg : 'transparent',
                    color: active ? style.color : 'var(--mut)',
                    border: active ? `1px solid ${style.color}` : '1px solid var(--bd-mid)',
                    transition: 'background .15s ease, color .15s ease, border-color .15s ease',
                  }}
                >
                  {type}
                </button>
              );
            })}
          </div>
        </Reveal>

        {/* Table */}
        <Reveal delay={40}>
          <div style={{ border: '1px solid var(--bd-mid)', borderRadius: 10, overflow: 'hidden' }}>
            {/* Header row */}
            <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 90px 90px 140px', gap: 16, padding: '10px 16px', background: 'var(--surf2)', borderBottom: '1px solid var(--bd-mid)' }}>
              {['TYPE', 'PROJECT / TX', 'AMOUNT', 'CO₂e', 'DATE'].map(h => (
                <span key={h} style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--mut)', textAlign: h === 'TYPE' || h === 'PROJECT / TX' ? 'left' : 'right' }}>{h}</span>
              ))}
            </div>

            {!wallet.address && (
              <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mut)', padding: '32px 16px', textAlign: 'center', letterSpacing: '.08em' }}>
                Connect your wallet to view transaction history.{' '}
                <button
                  onClick={() => wallet.openWalletModal()}
                  style={{ background: 'none', border: 'none', color: 'var(--g)', cursor: 'pointer', fontFamily: MONO, fontSize: 10, padding: 0 }}
                >
                  Connect ↗
                </button>
              </div>
            )}

            {wallet.address && loading && (
              <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mut)', padding: '32px 16px', textAlign: 'center', letterSpacing: '.08em' }}>LOADING…</div>
            )}

            {wallet.address && !loading && filtered.length === 0 && (
              <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mut)', padding: '32px 16px', textAlign: 'center', letterSpacing: '.08em' }}>
                {txs.length === 0 ? 'NO TRANSACTIONS FOUND' : 'NO MATCHING TRANSACTIONS'}
              </div>
            )}

            {filtered.map((tx, i) => {
              const style = txStyle(tx.transactionType);
              const shortTx = tx.txHash ? `${tx.txHash.slice(0, 8)}…${tx.txHash.slice(-4)}` : '—';
              return (
                <div
                  key={tx._id ?? `${tx.txHash}-${i}`}
                  style={{ display: 'grid', gridTemplateColumns: '80px 1fr 90px 90px 140px', alignItems: 'center', gap: 16, padding: '13px 16px', borderBottom: i < filtered.length - 1 ? '1px solid var(--bd-mid)' : 'none' }}
                >
                  {/* Type badge */}
                  <span style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.08em', padding: '3px 8px', borderRadius: 4, background: style.bg, color: style.color, display: 'inline-block' }}>
                    {tx.transactionType ?? 'EVENT'}
                  </span>

                  {/* Project / tx */}
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--ink)' }}>
                      {tx.projectId != null ? `Project #${tx.projectId}` : '—'}
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mut)', marginTop: 2 }}>{shortTx} ↗</div>
                  </div>

                  {/* Amount */}
                  <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--g)', textAlign: 'right' }}>
                    {tx.tokenAmount != null ? `${tx.tokenAmount} SAL` : '—'}
                  </span>

                  {/* CO₂ */}
                  <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mut)', textAlign: 'right' }}>
                    {tx.co2Kg != null ? `${tx.co2Kg} kg` : '—'}
                  </span>

                  {/* Date */}
                  <span style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mut)', textAlign: 'right' }}>
                    {tx.timestamp ? formatDate(tx.timestamp) : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        </Reveal>

        {/* Summary */}
        {!loading && txs.length > 0 && (
          <Reveal delay={80}>
            <div style={{ marginTop: 16, fontFamily: MONO, fontSize: 8, color: 'var(--mut)', letterSpacing: '.06em' }}>
              {filtered.length} of {txs.length} transactions shown
              {activeFilter !== 'ALL' && (
                <button onClick={() => setActiveFilter('ALL')} style={{ marginLeft: 12, background: 'none', border: 'none', color: 'var(--g)', cursor: 'pointer', fontFamily: MONO, fontSize: 8 }}>
                  CLEAR FILTER ✕
                </button>
              )}
            </div>
          </Reveal>
        )}
      </div>

      <div style={{ borderTop: '1px solid var(--bd-soft)', fontFamily: MONO, fontSize: 7, letterSpacing: '.13em', textTransform: 'uppercase', color: 'var(--faint)', padding: '20px 34px', textAlign: 'center' }}>
        © 2026 SALX | SAOLA CARBON MARKETPLACE. POWERED BY AVALANCHE.
      </div>
    </div>
  );
}
