import { useEffect, useState } from 'react';
import { backend } from '../services/backend';
import { shortAddress, formatNumber } from '../lib/format';
import { LeaderboardHero } from '../components/leaderboard/LeaderboardHero';
import { RankHighlightCards } from '../components/leaderboard/RankHighlightCards';
import type { LeaderRow } from '../components/leaderboard/RankHighlightCards';

const MONO = "'JetBrains Mono', monospace";
const SYNE = "'Syne', sans-serif";

export function LeaderboardPage() {
  const [rows, setRows] = useState<LeaderRow[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    backend
      .leaderboard()
      .then((d: any) => { setRows(Array.isArray(d) ? d : (d?.leaderboard ?? [])); setStatus('ready'); })
      .catch(() => { setRows([]); setStatus('error'); });
  }, []);

  const totalKg = rows.reduce(
    (sum, r) => sum + (r.totalRetiredCO2Kg ?? r.totalRetired ?? r.retiredCO2Kg ?? 0),
    0,
  );

  return (
    <div className="home-dc" style={{ animation: 'fadeUp .35s ease' }}>
      <div className="home-dc-section" style={{ maxWidth: 1000, padding: '48px 34px 60px' }}>

        <LeaderboardHero totalRetiredKg={totalKg} entryCount={rows.length} />

        {rows.length >= 3 && <RankHighlightCards rows={rows} />}

        {/* Table */}
        <div style={{ marginTop: 20, border: '1px solid var(--bd-soft)', borderRadius: 12, overflow: 'hidden' }}>
          {/* Table header */}
          <div style={{ display: 'grid', gridTemplateColumns: '52px 2fr 1fr 1fr', gap: 12, alignItems: 'center', padding: '9px 12px', fontFamily: MONO, fontSize: 7, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--faint)', borderBottom: '1px solid var(--bd-soft)' }}>
            <span>RANK</span>
            <span>ENTERPRISE / WALLET</span>
            <span>RETIRED</span>
            <span>STATUS</span>
          </div>

          {rows.length === 0 ? (
            <div style={{ padding: '28px 12px', fontFamily: MONO, fontSize: 10, color: 'var(--mut)', letterSpacing: '.08em', textAlign: 'center' }}>
              {status === 'loading' ? 'LOADING…' : status === 'error' ? 'COULD NOT LOAD THE LEADERBOARD. RELOAD IN A MINUTE.' : 'NO DATA YET.'}
            </div>
          ) : (
            rows.map((r, i) => {
              const address = r.parentWalletAddress ?? r.walletAddress ?? r.address ?? '';
              const kg = r.totalRetiredCO2Kg ?? r.totalRetired ?? r.retiredCO2Kg ?? 0;
              return (
                <div
                  key={address || i}
                  style={{ display: 'grid', gridTemplateColumns: '52px 2fr 1fr 1fr', gap: 12, alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid var(--bd-soft)', fontSize: 9 }}
                >
                  <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.06em', color: 'var(--g)', fontWeight: 700 }}>
                    #{String(i + 1).padStart(2, '0')}
                  </span>
                  <span>
                    <strong style={{ fontFamily: SYNE, fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{shortAddress(address, 8, 6)}</strong>
                    {' '}
                    <span style={{ color: 'var(--mut)', fontFamily: MONO, fontSize: 8 }}>· SALX participant</span>
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--ink)' }}>{formatNumber(kg)} kg</span>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: MONO, fontSize: 7, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--g)', border: '1px solid rgba(45,201,34,.30)', borderRadius: 999, padding: '4px 7px', width: 'fit-content' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--g)', display: 'inline-block', flexShrink: 0 }} />
                    {r.certificateCount != null ? `${r.certificateCount} SBTs` : 'VERIFIED'}
                  </div>
                </div>
              );
            })
          )}
        </div>

      </div>

      <div style={{ borderTop: '1px solid var(--bd-soft)', fontFamily: MONO, fontSize: 7, letterSpacing: '.13em', textTransform: 'uppercase', color: 'var(--faint)', padding: '20px 34px', textAlign: 'center' }}>
        © 2026 SALX | SAOLA CARBON MARKETPLACE. POWERED BY AVALANCHE.
      </div>
    </div>
  );
}
