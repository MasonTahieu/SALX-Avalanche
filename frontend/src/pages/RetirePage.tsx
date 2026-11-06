import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useWallet } from '../contexts/WalletContext';
import type { Project } from '../types/domain';
import { useRetireFlow } from '../components/retire/useRetireFlow';
import { CertificateCard } from '../components/certificate/CertificateCard';
import { env } from '../config/env';

const MONO = "'JetBrains Mono', monospace";
const SYNE = "'Syne', sans-serif";

/* ── Certificate preview card (right panel, idle state) ── */
function CertPreview({
  totalSAL,
  kgPerSAL,
  projects,
  ownerAddress,
}: {
  totalSAL: number;
  kgPerSAL: number;
  projects: string[];
  ownerAddress: string | null;
}) {
  const short = ownerAddress ? `${ownerAddress.slice(0, 6)}…${ownerAddress.slice(-4)}` : '0x…';
  const tons = (totalSAL * kgPerSAL) / 1000;
  return (
    <section style={{ position: 'relative', minHeight: 420, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'linear-gradient(150deg,var(--surf2),var(--surf))', border: '1px solid rgba(45,201,34,.30)', boxShadow: '0 30px 55px rgba(0,0,0,.35)', borderRadius: 12, padding: 18 }}>
      <div style={{ position: 'absolute', width: 280, height: 280, borderRadius: '50%', right: -70, top: -80, background: 'rgba(45,201,34,.14)', filter: 'blur(40px)', animation: 'certGlow 4s ease infinite', pointerEvents: 'none' }} />

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ width: 32, height: 32, display: 'grid', placeItems: 'center', borderRadius: 6, background: 'var(--surf2)', fontFamily: SYNE, fontWeight: 800, fontSize: 13, color: 'var(--g)' }}>S</div>
        <span style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.08em', textTransform: 'uppercase', border: '1px solid rgba(45,201,34,.30)', borderRadius: 999, padding: '4px 8px', color: 'var(--g)' }}>SOULBOUND TOKEN</span>
      </div>

      <div style={{ position: 'relative', zIndex: 1, marginTop: 'auto' }}>
        <span style={{ display: 'block', fontFamily: MONO, fontSize: 7, letterSpacing: '.13em', textTransform: 'uppercase', color: 'var(--mut)' }}>BENEFICIARY</span>
        <h2 style={{ fontFamily: SYNE, fontWeight: 700, fontSize: 22, letterSpacing: '-.01em', lineHeight: 1.14, maxWidth: 430, margin: '9px 0 12px', color: 'var(--ink)' }}>
          {projects.length > 0 ? projects.join(', ') : 'Select a project →'}
        </h2>
        <div style={{ fontFamily: MONO, fontSize: 17, color: 'var(--g)', fontWeight: 700, textShadow: '0 0 24px rgba(45,201,34,.3)' }}>
          {totalSAL} SAL{' '}
          <span style={{ fontSize: 9, color: 'var(--mut)', fontWeight: 500 }}>({tons.toFixed(2)} TONS CO₂e)</span>
        </div>
        {projects.length > 0 && (
          <div style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mut)', marginTop: 6, letterSpacing: '.04em' }}>PROJECT: {projects[0]}</div>
        )}
      </div>

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 26 }}>
        <span style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mut)' }}>{short} ↗</span>
        <div style={{ width: 32, height: 32, borderRadius: 7, background: totalSAL > 0 ? 'var(--g)' : 'var(--surf2)', color: totalSAL > 0 ? 'var(--bg)' : 'var(--mut)', display: 'grid', placeItems: 'center', fontSize: 18, fontWeight: 700, flex: 'none', transition: 'background .3s ease' }}>✓</div>
      </div>
    </section>
  );
}

/* ── Pending cert card (tx submitted) ── */
function CertPending({ txHash, onReload }: { txHash: string; onReload: () => Promise<void> }) {
  return (
    <section style={{ minHeight: 420, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(150deg,var(--surf2),var(--surf))', border: '1px solid rgba(45,201,34,.20)', borderRadius: 12, padding: 18 }}>
      <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', color: 'var(--g)', marginBottom: 14 }}>TX SUBMITTED</div>
      <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--ink)', wordBreak: 'break-all', textAlign: 'center', padding: '0 12px', marginBottom: 18 }}>{txHash}</div>
      <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mut)', marginBottom: 20, letterSpacing: '.06em' }}>Indexing certificate… this may take a few seconds.</div>
      <button onClick={onReload} style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', padding: '9px 20px', borderRadius: 8, background: 'rgba(45,201,34,.13)', border: '1px solid rgba(45,201,34,.4)', color: 'var(--g)', cursor: 'pointer' }}>CHECK CERTIFICATE</button>
    </section>
  );
}

/* ── Main page ── */
export function RetirePage() {
  const wallet = useWallet();
  const flow = useRetireFlow();
  const [retiredProject, setRetiredProject] = useState<Project | null>(null);

  const selectedProjects = flow.selectedRows.map(r => r.project.projectName ?? `#${r.project.onChainProjectId}`);

  const handleRetire = async () => {
    // Capture project before flow.run() clears selectedRows
    const project = flow.selectedRows[0]?.project ?? null;
    setRetiredProject(project);
    await flow.run();
  };

  return (
    <div className="home-dc" style={{ animation: 'fadeUp .35s ease' }}>
      <div className="home-dc-section" style={{ maxWidth: 1060, margin: '0 auto', padding: '38px 34px 55px' }}>
        {/* Terminal beside the summary on wide screens, stacked below 760px (index.css). */}
        <div className="retire-layout">

          {/* ── Terminal panel (left) ── */}
          <section style={{ background: 'var(--surf)', border: '1px solid var(--bd-str)', borderRadius: 12, padding: 18, display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--mut)' }}>RETIREMENT TERMINAL / ERC-1155</span>
            <div style={{ height: 1, background: 'linear-gradient(90deg,var(--g),transparent)', margin: '13px 0 18px', flex: 'none' }} />
            <h1 style={{ fontFamily: SYNE, fontWeight: 800, fontSize: 28, lineHeight: .98, margin: '0 0 12px', color: 'var(--ink)' }}>
              Retire carbon.<br /><span style={{ color: 'var(--g)' }}>Mint proof.</span>
            </h1>
            <p style={{ fontSize: 8, lineHeight: 1.5, color: 'var(--mut)', margin: '0 0 20px' }}>
              Your retirement is permanent and written to an auditable Soulbound Token certificate.
            </p>

            {/* Holdings checklist */}
            {!wallet.address ? (
              <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mut)', padding: '12px 0', lineHeight: 1.7 }}>
                Connect your wallet to view SAL holdings.
              </div>
            ) : flow.loadingHoldings ? (
              <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mut)', letterSpacing: '.08em', padding: '12px 0' }}>LOADING HOLDINGS…</div>
            ) : flow.holdings.length === 0 ? (
              <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mut)', padding: '12px 0' }}>
                No SAL holdings found.{' '}
                <a href="/marketplace" style={{ color: 'var(--g)', textDecoration: 'none' }}>Buy SAL →</a>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {flow.holdings.map(row => {
                  const id = row.project.onChainProjectId!;
                  const selected = (flow.selection[id] ?? 0) > 0;
                  const disabled = !selected && flow.selectedRows.length >= flow.config.maxProjects;
                  return (
                    <div
                      key={row.project._id}
                      style={{ background: selected ? 'rgba(45,201,34,.08)' : 'var(--surf2)', border: `1px solid ${selected ? 'rgba(45,201,34,.27)' : 'var(--bd-str)'}`, borderRadius: 8, padding: '10px 12px', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? .5 : 1, transition: 'border-color .18s ease, background .18s ease' }}
                      onClick={() => !disabled && flow.toggleSource(row)}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: selected ? 8 : 0 }}>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink)' }}>{row.project.projectName}</div>
                          <div style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mut)', marginTop: 2 }}>{row.balance} SAL available</div>
                        </div>
                        <div style={{ width: 18, height: 18, borderRadius: 4, border: `1.5px solid ${selected ? 'var(--g)' : 'var(--bd-str)'}`, background: selected ? 'rgba(45,201,34,.2)' : 'transparent', display: 'grid', placeItems: 'center', color: 'var(--g)', fontSize: 10, flex: 'none' }}>
                          {selected ? '✓' : ''}
                        </div>
                      </div>
                      {selected && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surf)', borderRadius: 6, padding: '6px 10px' }} onClick={e => e.stopPropagation()}>
                          <input
                            type="number" min={1} max={row.balance}
                            value={flow.selection[id] ?? 1}
                            onChange={e => flow.setAmount(id, Math.min(Number(e.target.value), row.balance))}
                            style={{ border: 'none', outline: 'none', background: 'transparent', flex: 1, minWidth: 0, fontSize: 13, color: 'var(--ink)' }}
                          />
                          <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.12em', color: 'var(--g)', flex: 'none' }}>SAL</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Preview box */}
            {flow.totalSAL > 0 && (
              <div style={{ border: '1px solid rgba(45,201,34,.30)', background: 'rgba(45,201,34,.12)', borderRadius: 8, padding: '10px 11px', marginBottom: 14 }}>
                <span style={{ display: 'block', fontFamily: MONO, fontSize: 7, letterSpacing: '.13em', textTransform: 'uppercase', color: 'var(--g)' }}>RETIREMENT PREVIEW</span>
                <strong style={{ display: 'block', fontSize: 9, color: 'var(--ink)', marginTop: 6 }}>
                  <span style={{ fontSize: 16, color: 'var(--g)', letterSpacing: '-.02em', fontWeight: 700 }}>{flow.totalSAL}</span>{' '}
                  SAL = {(flow.totalSAL * flow.config.kgPerSAL / 1000).toFixed(2)} Tons CO₂e
                </strong>
                <div style={{ fontFamily: MONO, fontSize: 7, color: 'var(--mut)', marginTop: 4 }}>Fee: {flow.config.feeETH} {env.nativeSymbol}</div>
              </div>
            )}

            {flow.error && (
              <div style={{ fontFamily: MONO, fontSize: 9, color: '#ff6b5b', background: 'rgba(204,12,0,.08)', border: '1px solid rgba(204,12,0,.25)', borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>
                {flow.error}
              </div>
            )}

            {/* Submit button — opens modal when disconnected, runs flow when connected */}
            <button
              disabled={!!wallet.address && (flow.busy || flow.selectedRows.length === 0 || flow.invalidAmount)}
              onClick={!wallet.address ? () => wallet.openWalletModal() : handleRetire}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                border: 'none', borderRadius: 999, padding: 11,
                fontFamily: MONO, fontSize: 8, letterSpacing: '.1em', textTransform: 'uppercase',
                cursor: wallet.address && (flow.busy || flow.selectedRows.length === 0 || flow.invalidAmount) ? 'not-allowed' : 'pointer',
                fontWeight: 800,
                background: !wallet.address
                  ? 'var(--g)'
                  : flow.busy || flow.selectedRows.length === 0
                    ? 'var(--surf2)'
                    : 'linear-gradient(90deg,#e8913c,#ff5a36)',
                color: !wallet.address
                  ? '#08150e'
                  : flow.busy || flow.selectedRows.length === 0 ? 'var(--mut)' : '#1a0d05',
                width: '100%', marginTop: 'auto',
                opacity: flow.busy ? .6 : 1,
                transition: 'background .2s ease, opacity .15s ease',
              }}
            >
              {!wallet.address
                ? 'CONNECT WALLET TO RETIRE ↗'
                : flow.busy ? 'PROCESSING…' : 'RETIRE & MINT SOULBOUND ↗'}
            </button>
          </section>

          {/* ── Certificate panel (right) ── */}
          {flow.certState.phase === 'idle' && (
            <CertPreview
              totalSAL={flow.totalSAL}
              kgPerSAL={flow.config.kgPerSAL}
              projects={selectedProjects}
              ownerAddress={wallet.address}
            />
          )}
          {flow.certState.phase === 'pending' && (
            <CertPending txHash={flow.certState.txHash} onReload={flow.reloadCertificate} />
          )}
          {flow.certState.phase === 'found' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <CertificateCard certificate={flow.certState.certificate} project={retiredProject ?? undefined} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, alignSelf: 'flex-end' }}>
                <Link
                  to="/dashboard?tab=certificates"
                  style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.08em', color: 'var(--g)', textDecoration: 'none' }}
                >
                  VIEW ALL CERTIFICATES →
                </Link>
                <button
                  onClick={flow.resetAfterRetirement}
                  style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.08em', background: 'var(--surf2)', border: '1px solid var(--bd-str)', color: 'var(--mut)', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }}
                >
                  RETIRE MORE
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--bd-soft)', fontFamily: MONO, fontSize: 7, letterSpacing: '.13em', textTransform: 'uppercase', color: 'var(--faint)', padding: '20px 34px', textAlign: 'center' }}>
        © 2026 SALX | SAOLA CARBON MARKETPLACE. POWERED BY AVALANCHE.
      </div>
    </div>
  );
}
