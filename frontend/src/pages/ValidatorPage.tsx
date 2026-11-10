import { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserProvider, Contract } from 'ethers';
import { backend } from '../services/backend';
import { getInjectedProvider, ensureTargetChain } from '../services/blockchain';
import { env } from '../config/env';
import marketplaceArtifact from '../contracts/abis/SALMarketplace.json';
import type { Project, VoteProgress } from '../types/domain';
import { errorMessage } from '../lib/errors';
import { ipfsToHttp } from '../lib/projectMeta';
import { LazyDocumentViewer, openInPlace, toViewerDocuments } from '../components/documents/LazyDocumentViewer';
import { useWallet } from '../contexts/WalletContext';

const MONO = "'JetBrains Mono', monospace";
const SYNE = "'Syne', sans-serif";

// This page is lazy-loaded and imports ethers itself, so it can build the
// provider synchronously.
const getBrowserProvider = () => new BrowserProvider(getInjectedProvider());

// ── Scroll-reveal ──────────────────────────────────────────────────────────
function Reveal({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { el.classList.add('is-visible'); obs.disconnect(); } }, { threshold: 0.08 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return <div ref={ref} className="dc-reveal">{children}</div>;
}

// ── Types ──────────────────────────────────────────────────────────────────
interface ProjectRow {
  project: Project;
  votes: VoteProgress | null;
}

// ── Main component ─────────────────────────────────────────────────────────
export function ValidatorPage() {
  const wallet = useWallet();
  const [validatorKey, setValidatorKey] = useState(() => sessionStorage.getItem('sal.adminKey') || '');
  const [keyInput, setKeyInput] = useState('');
  const [rows, setRows] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; err: boolean } | null>(null);
  const [detail, setDetail] = useState<ProjectRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [authChecking, setAuthChecking] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [votedProjectIds, setVotedProjectIds] = useState<Set<number>>(new Set());
  // Index of the MRV document being previewed in the detail view, if any.
  const [docViewerIndex, setDocViewerIndex] = useState<number | null>(null);
  useEffect(() => { setDocViewerIndex(null); }, [detail]);

  // ── Load pending projects + vote progress ─────────────────────────────
  const load = useCallback(async (key: string) => {
    if (!key) return;
    setLoading(true);
    setMsg(null);
    try {
      const projects = await backend.pendingProjects(key);
      const voteRows = await Promise.all(
        projects
          .filter(p => p.onChainProjectId != null)
          .map(p => backend.votes(p.onChainProjectId!).catch(() => null))
      );
      const voteMap = new Map<number, VoteProgress | null>();
      projects.filter(p => p.onChainProjectId != null).forEach((p, i) => {
        voteMap.set(p.onChainProjectId!, voteRows[i]);
      });
      setRows(projects.map(p => ({ project: p, votes: p.onChainProjectId != null ? (voteMap.get(p.onChainProjectId!) ?? null) : null })));
    } catch (e) {
      setMsg({ text: errorMessage(e), err: true });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (validatorKey) load(validatorKey); }, [validatorKey, load]);

  // After rows load, check which projects the connected validator has already voted on
  useEffect(() => {
    if (!wallet.address || !env.marketplaceAddress || rows.length === 0) return;
    const provider = getBrowserProvider();
    const mp = new Contract(
      env.marketplaceAddress,
      ['function hasVotedOnProject(uint256, address) view returns (bool)'],
      provider,
    );
    Promise.all(
      rows
        .filter(r => r.project.onChainProjectId != null)
        .map(r =>
          mp.hasVotedOnProject(r.project.onChainProjectId!, wallet.address!)
            .then((voted: boolean) => ({ id: r.project.onChainProjectId!, voted }))
        ),
    )
      .then(results => setVotedProjectIds(new Set(results.filter(r => r.voted).map(r => r.id))))
      .catch(() => {});
  }, [rows, wallet.address]);

  // Clear auth when wallet switches or when session has no wallet binding
  useEffect(() => {
    if (!wallet.address) return; // wallet not connected — keep current auth state
    if (!sessionStorage.getItem('sal.adminKey')) return; // nothing authenticated
    const storedWallet = sessionStorage.getItem('sal.adminKey.wallet');
    // No wallet bound (old session) OR bound wallet doesn't match current account
    if (!storedWallet || storedWallet.toLowerCase() !== wallet.address.toLowerCase()) {
      sessionStorage.removeItem('sal.adminKey');
      sessionStorage.removeItem('sal.adminKey.wallet');
      setValidatorKey('');
      setKeyInput('');
    }
  }, [wallet.address]);

  const handleAuth = async () => {
    const k = keyInput.trim();
    if (!k) return;
    if (!wallet.address) { setAuthError('Connect your wallet first.'); return; }
    setAuthError(null);
    setAuthChecking(true);
    try {
      const provider = getBrowserProvider();
      const mp = new Contract(
        env.marketplaceAddress,
        ['function isValidator(address) view returns (bool)'],
        provider,
      );
      const valid: boolean = await mp.isValidator(wallet.address);
      if (!valid) {
        setAuthError('This wallet is not registered as a validator.');
        return;
      }
    } catch {
      setAuthError('Could not verify validator status. Check wallet connection.');
      return;
    } finally {
      setAuthChecking(false);
    }
    sessionStorage.setItem('sal.adminKey', k);
    sessionStorage.setItem('sal.adminKey.wallet', wallet.address);
    setValidatorKey(k);
  };

  // ── Vote action — signed directly by the validator's connected wallet ─────
  const castVote = async (row: ProjectRow, approve: boolean) => {
    if (!row.project.onChainProjectId) return;
    setBusy(true);
    setMsg(null);
    try {
      await ensureTargetChain();
      const signer = await getBrowserProvider().getSigner();
      const mp = new Contract(env.marketplaceAddress, marketplaceArtifact.abi, signer);
      const tx = await mp.voteOnProject(row.project.onChainProjectId, approve);
      await tx.wait(1);
      setMsg({ text: `✓ Vote ${approve ? 'APPROVE' : 'REJECT'} recorded on-chain`, err: false });
      await load(validatorKey);
    } catch (e) {
      setMsg({ text: errorMessage(e), err: true });
    } finally {
      setBusy(false);
    }
  };

  // ── Auth gate ─────────────────────────────────────────────────────────
  if (!validatorKey) {
    return (
      <div className="home-dc" style={{ animation: 'fadeUp .35s ease' }}>
        <div className="home-dc-section" style={{ padding: '60px 34px 80px', maxWidth: 520 }}>
          <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--gold)' }}>VALIDATOR DASHBOARD</span>
          <h1 style={{ fontFamily: SYNE, fontWeight: 800, fontSize: 'clamp(28px,5vw,42px)', margin: '12px 0 6px', color: 'var(--ink)' }}>Enter validator key</h1>
          <p style={{ fontSize: 11, color: 'var(--mut)', marginBottom: 24, lineHeight: 1.6 }}>Access is gated. Your key is stored only in sessionStorage.</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              type="password"
              placeholder="ADMIN_SECRET_KEY"
              value={keyInput}
              onChange={e => { setKeyInput(e.target.value); setAuthError(null); }}
              onKeyDown={e => e.key === 'Enter' && handleAuth()}
              disabled={authChecking}
              style={{ flex: 1, background: 'var(--surf)', border: '1px solid var(--bd-str)', borderRadius: 8, padding: '11px 14px', fontFamily: MONO, fontSize: 10, color: 'var(--ink)', outline: 'none', opacity: authChecking ? .6 : 1 }}
            />
            <button
              onClick={handleAuth}
              disabled={authChecking}
              style={{ background: 'var(--gold)', border: 'none', borderRadius: 8, padding: '11px 18px', fontFamily: MONO, fontSize: 9, fontWeight: 700, color: '#3a2c05', cursor: authChecking ? 'not-allowed' : 'pointer', opacity: authChecking ? .6 : 1, whiteSpace: 'nowrap' }}
            >
              {authChecking ? 'CHECKING…' : 'ENTER'}
            </button>
          </div>
          {authError && (
            <p style={{ fontFamily: MONO, fontSize: 9, color: '#ff6b5b', marginTop: 10, lineHeight: 1.6 }}>{authError}</p>
          )}
        </div>
      </div>
    );
  }

  // ── Project detail view ───────────────────────────────────────────────
  if (detail) {
    const { project, votes } = detail;
    const quorum = votes?.approvalQuorum ?? 1;
    const approvals = votes?.approvalVotes ?? 0;
    const rejections = votes?.rejectionVotes ?? 0;
    const eligible = votes?.eligibleValidatorCount ?? 0;
    const barPct = Math.min(100, Math.round((approvals / quorum) * 100));
    type DocEntry = string | { name?: string; uri?: string };
    const rawDocs: DocEntry[] = (project.projectMetadata?.properties as any)?.documents ?? [];
    const toUri = (d: DocEntry) => (typeof d === 'string' ? d : (d.uri ?? ''));
    const toLabel = (d: DocEntry, i: number) => (typeof d === 'string' ? d : (d.name || `Document ${i + 1}`));
    const toHref = (doc: DocEntry) => ipfsToHttp(toUri(doc), typeof doc === 'string' ? undefined : doc.name);

    return (
      <div className="home-dc" style={{ animation: 'fadeUp .35s ease' }}>
        <div className="home-dc-section" style={{ padding: '38px 34px 80px' }}>

          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, fontFamily: MONO, fontSize: 9 }}>
            <button onClick={() => setDetail(null)} style={{ background: 'none', border: '1px solid var(--bd-str)', borderRadius: 6, padding: '6px 12px', color: 'var(--mut)', cursor: 'pointer', fontFamily: MONO, fontSize: 8, letterSpacing: '.08em' }}>
              ← PENDING PROJECTS
            </button>
            <span style={{ color: 'var(--bd)' }}>/</span>
            <span style={{ color: 'var(--mut)' }}>{project.onChainProjectId ? `#${project.onChainProjectId}` : project._id.slice(-6)}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 28, alignItems: 'start' }}>

            {/* Left: detail */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                {project.onChainProjectId && <span style={{ fontFamily: MONO, fontSize: 8, background: 'var(--surf2)', border: '1px solid var(--bd-str)', borderRadius: 4, padding: '3px 8px', color: 'var(--mut)' }}>#{project.onChainProjectId}</span>}
                {project.projectMetadata?.properties?.project_type && <span style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mut)' }}>{project.projectMetadata.properties.project_type}</span>}
              </div>
              <h1 style={{ fontFamily: SYNE, fontWeight: 800, fontSize: 'clamp(24px,4vw,38px)', lineHeight: .95, letterSpacing: '-.02em', margin: '0 0 8px', color: 'var(--ink)' }}>{project.projectName}</h1>
              <p style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mut)', margin: '0 0 16px' }}>
                {project.projectMetadata?.properties?.location} · Owner: {project.ownerWallet?.slice(0, 8)}…{project.ownerWallet?.slice(-4)}
              </p>
              {project.projectMetadata?.description && (
                <p style={{ fontSize: 12, color: 'var(--mut)', lineHeight: 1.6, margin: '0 0 22px' }}>{project.projectMetadata.description}</p>
              )}

              {/* Stats grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 22 }}>
                {[
                  { label: 'PROPOSED SAL', value: String(project.mintedTokenAmount ?? Math.floor((project.totalCarbon ?? 0) / 10)), color: 'var(--g)' },
                  { label: 'CO₂ (kg)', value: String(project.totalCarbon ?? '—'), color: 'var(--ink)' },
                  { label: 'SUBMITTED', value: project.projectMetadata?.properties?.monitoring_period?.start ?? '—', color: 'var(--ink)' },
                ].map(s => (
                  <div key={s.label} style={{ background: 'var(--surf)', border: '1px solid var(--bd-str)', borderRadius: 8, padding: '12px 14px' }}>
                    <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.12em', color: 'var(--mut)', marginBottom: 6 }}>{s.label}</div>
                    <strong style={{ fontFamily: SYNE, fontWeight: 700, fontSize: 16, color: s.color }}>{s.value}</strong>
                  </div>
                ))}
              </div>

              {/* MRV docs */}
              {rawDocs.length > 0 && (
                <div style={{ marginBottom: 22 }}>
                  <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.1em', color: 'var(--mut)', marginBottom: 10 }}>MRV DOCUMENTS</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {rawDocs.map((doc, i) => {
                      const label = toLabel(doc, i);
                      const href = toHref(doc);
                      return (
                        <div key={i} style={{ background: 'var(--surf)', border: '1px solid var(--bd-str)', borderRadius: 7, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontFamily: MONO, fontSize: 7, color: 'var(--g)', background: 'rgba(45,201,34,.12)', borderRadius: 3, padding: '2px 6px' }}>DOC</span>
                            <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--ink)' }}>{label}</span>
                          </div>
                          {href && <a href={href} target="_blank" rel="noopener noreferrer" aria-haspopup="dialog" onClick={(e) => openInPlace(e, () => setDocViewerIndex(i))} style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mut)', textDecoration: 'none', padding: '8px 0 8px 10px', margin: '-8px 0' }}>VIEW</a>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* IPFS hash */}
              {project.ipfsHash && (
                <div style={{ background: 'var(--surf)', border: '1px solid var(--bd-str)', borderRadius: 8, padding: '11px 14px', fontFamily: MONO, fontSize: 8, color: 'var(--mut)' }}>
                  IPFS: <a href={ipfsToHttp(project.ipfsHash)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--g)', textDecoration: 'none' }}>{project.ipfsHash} ↗</a>
                </div>
              )}
            </div>

            {/* Right: vote panel (sticky) */}
            <div style={{ position: 'sticky', top: 20, background: 'var(--surf)', border: '1px solid rgba(231,199,101,.25)', borderRadius: 12, padding: '22px' }}>
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', color: 'var(--gold)', marginBottom: 16 }}>CAST YOUR VOTE</div>

              {/* Progress */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontFamily: MONO, fontSize: 8, color: 'var(--mut)' }}>
                  <span>{approvals} / {quorum} approvals</span>
                  <span>{eligible} eligible</span>
                </div>
                <div style={{ height: 6, background: 'var(--surf2)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${barPct}%`, background: 'var(--g)', borderRadius: 3, transition: 'width .4s ease' }} />
                </div>
                <div style={{ fontFamily: MONO, fontSize: 7, color: 'var(--mut)', marginTop: 6 }}>Quorum: {quorum} needed · {rejections} reject</div>
              </div>

              {/* Vote buttons */}
              {(() => {
                const alreadyVoted = project.onChainProjectId != null && votedProjectIds.has(project.onChainProjectId);
                const voteDisabled = busy || alreadyVoted;
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {alreadyVoted && (
                      <div style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mut)', textAlign: 'center', padding: '6px 0', letterSpacing: '.08em' }}>
                        VOTE ALREADY CAST
                      </div>
                    )}
                    <button
                      onClick={() => castVote(detail, true)}
                      disabled={voteDisabled}
                      style={{ background: 'var(--g)', border: '1px solid var(--g)', borderRadius: 8, padding: '14px', fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', fontWeight: 700, color: '#06110b', cursor: voteDisabled ? 'not-allowed' : 'pointer', opacity: voteDisabled ? .4 : 1, transition: 'opacity .15s,transform .15s', width: '100%' }}
                    >
                      APPROVE PROJECT ✓
                    </button>
                    <button
                      onClick={() => castVote(detail, false)}
                      disabled={voteDisabled}
                      style={{ background: 'rgba(204,12,0,.1)', border: '1px solid rgba(204,12,0,.3)', borderRadius: 8, padding: '12px', fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', color: '#ff6b5b', cursor: voteDisabled ? 'not-allowed' : 'pointer', opacity: voteDisabled ? .4 : 1, transition: 'opacity .15s', width: '100%' }}
                    >
                      REJECT PROJECT ✕
                    </button>
                  </div>
                );
              })()}

              <p style={{ fontFamily: MONO, fontSize: 7, color: 'var(--mut)', marginTop: 14, lineHeight: 1.7, textAlign: 'center' }}>
                On-chain. Permanent — requires wallet signature.
              </p>

              {msg && (
                <div style={{ marginTop: 12, background: msg.err ? 'rgba(204,12,0,.08)' : 'rgba(45,201,34,.08)', border: `1px solid ${msg.err ? 'rgba(204,12,0,.3)' : 'rgba(45,201,34,.3)'}`, borderRadius: 7, padding: '9px 12px', fontFamily: MONO, fontSize: 8, color: msg.err ? '#ff6b5b' : 'var(--g)' }}>
                  {msg.text}
                </div>
              )}
            </div>
          </div>
        </div>

        {docViewerIndex != null && (
          <LazyDocumentViewer
            documents={toViewerDocuments(rawDocs)}
            initialIndex={docViewerIndex}
            title={project.projectName}
            onClose={() => setDocViewerIndex(null)}
          />
        )}
      </div>
    );
  }

  // ── Project list view (isValHome) ──────────────────────────────────────
  return (
    <div className="home-dc" style={{ animation: 'fadeUp .35s ease' }}>
      <div className="home-dc-section" style={{ padding: '38px 34px 80px' }}>

        {/* Header row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
          <div>
            <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--mut)' }}>VALIDATOR DASHBOARD</span>
            <h1 style={{ fontFamily: SYNE, fontWeight: 800, fontSize: 'clamp(32px,5vw,52px)', lineHeight: .95, margin: '10px 0 0', color: 'var(--ink)' }}>Pending Projects</h1>
          </div>
          {/* Validator badge */}
          <div style={{ background: 'rgba(231,199,101,.08)', border: '1px solid rgba(231,199,101,.25)', borderRadius: 10, padding: '14px 18px', minWidth: 180 }}>
            <div style={{ fontFamily: MONO, fontSize: 8, color: 'var(--gold)', letterSpacing: '.12em', marginBottom: 4 }}>VALIDATOR</div>
            <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mut)' }}>
              {sessionStorage.getItem('sal.adminKey') ? 'Key: ●●●●●●●●' : '—'}
            </div>
            <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
              <button onClick={() => load(validatorKey)} style={{ fontFamily: MONO, fontSize: 7, background: 'var(--surf2)', border: '1px solid var(--bd-str)', borderRadius: 4, padding: '4px 8px', color: 'var(--mut)', cursor: 'pointer' }}>
                ↺ REFRESH
              </button>
              <button onClick={() => { sessionStorage.removeItem('sal.adminKey'); sessionStorage.removeItem('sal.adminKey.wallet'); setValidatorKey(''); setKeyInput(''); }} style={{ fontFamily: MONO, fontSize: 7, background: 'none', border: 'none', color: 'var(--mut)', cursor: 'pointer', textDecoration: 'underline' }}>
                LOGOUT
              </button>
            </div>
          </div>
        </div>

        {msg && (
          <div style={{ marginBottom: 20, background: msg.err ? 'rgba(204,12,0,.08)' : 'rgba(45,201,34,.08)', border: `1px solid ${msg.err ? 'rgba(204,12,0,.3)' : 'rgba(45,201,34,.3)'}`, borderRadius: 8, padding: '11px 14px', fontFamily: MONO, fontSize: 9, color: msg.err ? '#ff6b5b' : 'var(--g)' }}>
            {msg.text}
          </div>
        )}

        {loading && (
          <div style={{ padding: '40px 0', textAlign: 'center', fontFamily: MONO, fontSize: 9, color: 'var(--mut)', letterSpacing: '.1em' }}>
            LOADING…
          </div>
        )}

        {!loading && rows.length === 0 && (
          <div style={{ padding: '50px 0', textAlign: 'center', fontFamily: MONO, fontSize: 9, color: 'var(--mut)', letterSpacing: '.08em' }}>
            NO PENDING PROJECTS
          </div>
        )}

        {/* Project cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {rows.map(row => {
            const { project, votes } = row;
            const quorum = votes?.approvalQuorum ?? 1;
            const approvals = votes?.approvalVotes ?? 0;
            const rejections = votes?.rejectionVotes ?? 0;
            const eligible = votes?.eligibleValidatorCount ?? 0;
            const barPct = Math.min(100, Math.round((approvals / quorum) * 100));

            return (
              <Reveal key={project._id}>
                <article
                  className="home-dc-card"
                  style={{ background: 'var(--surf)', border: '1px solid var(--bd-str)', borderRadius: 12, padding: '20px 22px', cursor: 'pointer', transition: 'transform .18s ease,border-color .18s ease' }}
                  onClick={() => setDetail(row)}
                >
                  {/* Top row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        {project.onChainProjectId && <span style={{ fontFamily: MONO, fontSize: 7, background: 'var(--surf2)', border: '1px solid var(--bd-str)', borderRadius: 3, padding: '2px 7px', color: 'var(--mut)' }}>#{project.onChainProjectId}</span>}
                        {project.projectMetadata?.properties?.project_type && <span style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mut)' }}>{project.projectMetadata.properties.project_type}</span>}
                      </div>
                      <h3 style={{ fontFamily: SYNE, fontWeight: 700, fontSize: 16, margin: '0 0 4px', color: 'var(--ink)' }}>{project.projectName}</h3>
                      <span style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mut)' }}>{project.projectMetadata?.properties?.location || project.ownerWallet?.slice(0, 10) + '…'}</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: SYNE, fontWeight: 700, fontSize: 17, color: 'var(--g)' }}>{Math.floor((project.totalCarbon ?? 0) / 10)} SAL</div>
                      <div style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mut)', marginTop: 3 }}>{project.totalCarbon ?? '—'} kg CO₂</div>
                    </div>
                  </div>

                  {/* Vote progress */}
                  <div style={{ marginTop: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontFamily: MONO, fontSize: 8, color: 'var(--mut)' }}>
                      <span style={{ letterSpacing: '.1em' }}>VOTE PROGRESS</span>
                      <span>{approvals} / {quorum} needed</span>
                    </div>
                    <div style={{ height: 4, background: 'var(--surf2)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${barPct}%`, background: 'var(--g)', transition: 'width .4s ease' }} />
                    </div>
                  </div>

                  {/* Footer row */}
                  <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                    <span style={{ fontFamily: MONO, fontSize: 7, color: 'var(--mut)' }}>{approvals} approve · {rejections} reject · {eligible} eligible</span>
                    <button
                      onClick={e => { e.stopPropagation(); setDetail(row); }}
                      style={{ background: 'var(--g)', border: '1px solid var(--g)', borderRadius: 6, padding: '8px 14px', fontFamily: MONO, fontSize: 8, letterSpacing: '.1em', fontWeight: 700, color: '#06110b', cursor: 'pointer', transition: 'opacity .15s' }}
                    >
                      REVIEW & VOTE →
                    </button>
                  </div>
                </article>
              </Reveal>
            );
          })}
        </div>
      </div>
    </div>
  );
}
