import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BrowserProvider, Contract } from 'ethers';
import { backend } from '../services/backend';
import { getInjectedProvider, ensureTargetChain } from '../services/blockchain';
import { env } from '../config/env';
import marketplaceArtifact from '../contracts/abis/SALMarketplace.json';
import type { Project, VoteProgress } from '../types/domain';
import { errorMessage } from '../lib/errors';
import { useWallet } from '../contexts/WalletContext';

const MONO = "'JetBrains Mono', monospace";
const SYNE = "'Syne', sans-serif";
const SURF = '#101c18';
const SURF2 = '#162119';
const BD = 'var(--bd-mid)';
const GREEN = '#2dc922';
const INK = '#ede7dc';
const MUT = '#9ea5a8';
const RED = '#e05252';
const ORG = '#e8913c';
const GOLD = '#e7c765';
const PAGE_INK = 'var(--ink)';
const PAGE_MUT = 'var(--mut)';
const PAGE_GOLD = 'var(--admin-page-gold)';

function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add('is-visible'); obs.disconnect(); } },
      { threshold: 0.1 },
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

function StatusMsg({ msg }: { msg: string | null }) {
  if (!msg) return null;
  const isErr = msg.toLowerCase().includes('error') || msg.toLowerCase().includes('fail') || msg.toLowerCase().includes('lỗi');
  const isOk = msg.toLowerCase().includes('thành công') || msg.toLowerCase().includes('success') || msg.startsWith('OK');
  const color = isErr ? RED : isOk ? GREEN : GOLD;
  return (
    <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.06em', color, padding: '10px 14px', background: SURF2, border: `1px solid ${color}33`, borderRadius: 8, marginTop: 12, wordBreak: 'break-all' }}>
      {msg}
    </div>
  );
}

// This page is lazy-loaded and imports ethers itself, so it can build the
// provider synchronously.
const getBrowserProvider = () => new BrowserProvider(getInjectedProvider());

// ── On-chain validator helpers (call contract directly; blockchain.ts is read-only) ──
async function readValidatorList(): Promise<string[]> {
  const provider = getBrowserProvider();
  const mp = new Contract(env.marketplaceAddress, marketplaceArtifact.abi, provider);
  const count = Number(await mp.getValidatorsCount());
  if (count === 0) return [];
  return Promise.all(
    Array.from({ length: count }, (_, i) => mp.validators(i) as Promise<string>),
  );
}

async function addValidatorOnChain(address: string): Promise<string> {
  await ensureTargetChain();
  const signer = await getBrowserProvider().getSigner();
  const mp = new Contract(env.marketplaceAddress, marketplaceArtifact.abi, signer);
  const tx = await mp.addValidator(address);
  const receipt = await tx.wait(1);
  return receipt.hash as string;
}

interface ProjectRowProps {
  project: Project;
  vote: VoteProgress | undefined;
  adminKey: string;
  onDone: () => void;
  onMsg: (m: string) => void;
}

function ProjectRow({ project, vote, adminKey, onDone, onMsg }: ProjectRowProps) {
  const [co2, setCo2] = useState<number>(project.proposedCO2Kg ?? 0);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [mintSuccess, setMintSuccess] = useState(false);

  const run = async (fn: () => Promise<any>) => {
    setBusy(true);
    onMsg('Processing…');
    try {
      const res = await fn();
      onMsg(`OK${res?.txHash ? ` · tx ${res.txHash}` : ''}`);
      onDone();
    } catch (e) {
      onMsg(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const handleApprove = async () => {
    setBusy(true);
    setMintSuccess(false);
    onMsg('Processing…');
    try {
      const res = await backend.adminApprove(
        project._id,
        { approvedCO2Kg: co2, onChainProjectId: project.onChainProjectId ?? undefined },
        adminKey,
      );
      onMsg(`OK${res?.txHash ? ` · tx ${res.txHash}` : ''}`);
      setMintSuccess(true);
      onDone();
    } catch (e) {
      onMsg(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const voteTotal = (vote?.approvalVotes ?? 0) + (vote?.rejectionVotes ?? 0);
  const votePct = voteTotal > 0 ? Math.round(((vote?.approvalVotes ?? 0) / voteTotal) * 100) : 0;
  const quorum = vote?.quorumReached ?? false;

  return (
    <div style={{ background: SURF, border: `1px solid ${BD}`, borderRadius: 12, padding: '20px 22px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <div>
          <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.12em', color: MUT }}>
            ON-CHAIN #{project.onChainProjectId ?? '—'}
          </span>
          <h3 style={{ fontFamily: SYNE, fontWeight: 700, fontSize: 17, color: INK, margin: '4px 0 2px' }}>
            {project.projectName}
          </h3>
          <span style={{ fontFamily: MONO, fontSize: 9, color: MUT, letterSpacing: '.04em' }}>
            {project.ownerWallet ?? '—'}
          </span>
        </div>
        <span style={{
          fontFamily: MONO, fontSize: 8, letterSpacing: '.1em', padding: '4px 10px', borderRadius: 20,
          background: quorum ? `${GREEN}22` : `${GOLD}22`,
          color: quorum ? GREEN : GOLD,
          border: `1px solid ${quorum ? GREEN : GOLD}44`,
          whiteSpace: 'nowrap', marginTop: 2,
        }}>
          {quorum ? 'QUORUM MET' : 'PENDING'}
        </span>
      </div>

      {/* Vote progress */}
      {vote && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontSize: 8, color: MUT, letterSpacing: '.08em', marginBottom: 5 }}>
            <span>VALIDATOR VOTES</span>
            <span>{vote.approvalVotes} APPROVE / {vote.rejectionVotes} REJECT · {vote.approvalVotes}/{vote.approvalQuorum} required</span>
          </div>
          <div style={{ height: 4, background: SURF2, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${votePct}%`, background: `linear-gradient(90deg,${GREEN},#5ef55a)`, borderRadius: 2, transition: 'width .4s ease' }} />
          </div>
        </div>
      )}

      {/* Controls row 1: vote + blacklist */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {project.onChainProjectId != null && (
          <>
            <button
              disabled={busy}
              onClick={() => run(() => backend.adminVote(project.onChainProjectId!, true, adminKey))}
              style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.08em', padding: '7px 14px', borderRadius: 6, border: `1px solid ${GREEN}66`, background: `${GREEN}18`, color: GREEN, cursor: 'pointer', opacity: busy ? .5 : 1 }}
            >
              VOTE APPROVE
            </button>
            <button
              disabled={busy}
              onClick={() => run(() => backend.adminVote(project.onChainProjectId!, false, adminKey))}
              style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.08em', padding: '7px 14px', borderRadius: 6, border: `1px solid ${RED}66`, background: `${RED}18`, color: RED, cursor: 'pointer', opacity: busy ? .5 : 1 }}
            >
              VOTE REJECT
            </button>
            <button
              disabled={busy}
              onClick={() => run(() => backend.adminUnblacklistProject(project.onChainProjectId!, adminKey))}
              style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.08em', padding: '7px 14px', borderRadius: 6, border: `1px solid ${MUT}44`, background: 'transparent', color: MUT, cursor: 'pointer', opacity: busy ? .5 : 1 }}
            >
              UNBLACKLIST
            </button>
          </>
        )}
      </div>

      {/* Blacklist with reason */}
      {project.onChainProjectId != null && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <input
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Blacklist reason…"
            style={{ flex: 1, fontFamily: MONO, fontSize: 10, background: SURF2, border: `1px solid ${BD}`, borderRadius: 6, padding: '7px 12px', color: INK, outline: 'none' }}
          />
          <button
            disabled={busy || !reason.trim()}
            onClick={() => run(() => backend.adminBlacklistProject(project.onChainProjectId!, reason, adminKey))}
            style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.08em', padding: '7px 14px', borderRadius: 6, border: `1px solid ${RED}66`, background: `${RED}18`, color: RED, cursor: reason.trim() && !busy ? 'pointer' : 'not-allowed', opacity: reason.trim() && !busy ? 1 : .45 }}
          >
            BLACKLIST
          </button>
        </div>
      )}

      {/* Approve & Mint */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', paddingTop: 12, borderTop: `1px solid ${BD}` }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.1em', color: MUT, marginBottom: 5 }}>APPROVED CO₂ (kg)</div>
          <input
            type="number"
            step="10"
            value={co2}
            onChange={e => setCo2(Number(e.target.value))}
            style={{ width: '100%', fontFamily: MONO, fontSize: 12, background: SURF2, border: `1px solid ${BD}`, borderRadius: 6, padding: '8px 12px', color: INK, outline: 'none' }}
          />
        </div>
        <button
          disabled={busy || !quorum}
          onClick={handleApprove}
          style={{
            fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', padding: '9px 18px', borderRadius: 6,
            background: quorum && !busy ? 'linear-gradient(90deg,#e8913c,#ff5a36)' : SURF2,
            border: quorum ? '1px solid #e8913c88' : `1px solid ${BD}`,
            color: quorum ? '#fff' : MUT,
            cursor: quorum && !busy ? 'pointer' : 'not-allowed',
            transition: 'opacity .15s ease',
            opacity: busy ? .5 : 1,
            whiteSpace: 'nowrap',
          }}
        >
          APPROVE & MINT SAL
        </button>
      </div>

      {mintSuccess && (
        <div style={{ marginTop: 12, background: `${GREEN}14`, border: `1px solid ${GREEN}44`, borderRadius: 8, padding: '10px 14px', fontFamily: MONO, fontSize: 9, color: GREEN, letterSpacing: '.06em', lineHeight: 1.6 }}>
          TOKEN MINTED — The project owner must now go to <strong style={{ color: GREEN }}>Portfolio</strong> and create a listing for this project to appear in the Marketplace.
        </div>
      )}
    </div>
  );
}

export function AdminPage() {
  const wallet = useWallet();
  const [key, setKey] = useState(() => sessionStorage.getItem('sal.adminKey') || '');
  const [authed, setAuthed] = useState(() => !!sessionStorage.getItem('sal.adminKey'));
  const [keyInput, setKeyInput] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [votes, setVotes] = useState<Record<number, VoteProgress>>({});
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [validators, setValidators] = useState<string[]>([]);
  const [valLoading, setValLoading] = useState(false);
  const [valInput, setValInput] = useState('');
  const [valBusy, setValBusy] = useState(false);
  const [valMsg, setValMsg] = useState<string | null>(null);
  const [contractOwner, setContractOwner] = useState<string>('');

  const load = async (k = key) => {
    if (!k) return;
    setLoading(true);
    setMsg(null);
    try {
      const rows = await backend.pendingProjects(k);
      setProjects(rows);
      const voteRows = await Promise.all(
        rows.filter(p => p.onChainProjectId != null).map(p => backend.votes(p.onChainProjectId!))
      );
      setVotes(Object.fromEntries(voteRows.map(v => [v.projectId, v])));
    } catch (e) {
      setMsg(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const loadValidators = async () => {
    if (!env.marketplaceAddress) return;
    setValLoading(true);
    try {
      setValidators(await readValidatorList());
    } catch {
      // wallet may not be connected yet; silently ignore
    } finally {
      setValLoading(false);
    }
  };

  const handleEnter = () => {
    const k = keyInput.trim();
    if (!k) return;
    sessionStorage.setItem('sal.adminKey', k);
    sessionStorage.setItem('sal.adminKey.wallet', wallet.address ?? '');
    setKey(k);
    setAuthed(true);
    load(k);
    loadValidators();
  };

  useEffect(() => {
    if (authed && key) {
      load(key);
      loadValidators();
    }
  }, []); // eslint-disable-line

  // Clear auth when wallet switches or when session has no wallet binding
  useEffect(() => {
    if (!wallet.address) return; // wallet not connected — keep current auth state
    if (!sessionStorage.getItem('sal.adminKey')) return; // nothing authenticated
    const storedWallet = sessionStorage.getItem('sal.adminKey.wallet');
    // No wallet bound (old session) OR bound wallet doesn't match current account
    if (!storedWallet || storedWallet.toLowerCase() !== wallet.address.toLowerCase()) {
      sessionStorage.removeItem('sal.adminKey');
      sessionStorage.removeItem('sal.adminKey.wallet');
      setKey('');
      setAuthed(false);
    }
  }, [wallet.address]);

  // Fetch contract owner to gate admin actions to the owner wallet
  useEffect(() => {
    if (!env.marketplaceAddress) return;
    let provider: BrowserProvider;
    try {
      provider = getBrowserProvider();
    } catch {
      return; // no wallet extension: show the page, owner check waits for a wallet
    }
    const mp = new Contract(env.marketplaceAddress, ['function owner() view returns (address)'], provider);
    mp.owner()
      .then((addr: string) => setContractOwner(addr.toLowerCase()))
      .catch(() => {}); // fail open — secret key gate remains in effect
  }, [wallet.address]);

  const runGlobal = async (fn: () => Promise<any>) => {
    setMsg('Processing…');
    try {
      const res = await fn();
      setMsg(`OK${res?.txHash ? ` · tx ${res.txHash}` : ''}`);
    } catch (e) {
      setMsg(errorMessage(e));
    }
  };

  /* ── Auth gate ── */
  if (!authed) {
    return (
      <div className="home-dc" style={{ animation: 'fadeUp .35s ease' }}>
        <div className="home-dc-section" style={{ padding: '80px 34px', minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '100%', maxWidth: 420, textAlign: 'center' }}>
            <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.14em', color: RED, textTransform: 'uppercase' }}>ADMIN DASHBOARD</span>
            <h1 style={{ fontFamily: SYNE, fontWeight: 800, fontSize: 28, color: PAGE_INK, margin: '10px 0 6px' }}>Enter admin key</h1>
            <p style={{ fontFamily: MONO, fontSize: 10, color: PAGE_MUT, marginBottom: 24 }}>Access is gated. Your key is stored only in sessionStorage.</p>
            <input
              type="password"
              value={keyInput}
              onChange={e => setKeyInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleEnter()}
              placeholder="ADMIN_SECRET_KEY"
              autoFocus
              style={{ width: '100%', fontFamily: MONO, fontSize: 12, background: SURF, border: `1px solid ${BD}`, borderRadius: 8, padding: '12px 16px', color: INK, outline: 'none', marginBottom: 10, boxSizing: 'border-box' }}
            />
            <button
              onClick={handleEnter}
              style={{ width: '100%', fontFamily: MONO, fontSize: 10, letterSpacing: '.12em', padding: '12px', borderRadius: 8, background: `${RED}22`, border: `1px solid ${RED}66`, color: RED, cursor: 'pointer', textTransform: 'uppercase' }}
            >
              ENTER
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Owner wallet gate — only blocks once contract owner is resolved ── */
  const isOwner = !contractOwner ||
    (!!wallet.address && wallet.address.toLowerCase() === contractOwner);

  if (!isOwner) {
    const short = wallet.address ? `${wallet.address.slice(0, 8)}…${wallet.address.slice(-4)}` : '—';
    return (
      <div className="home-dc" style={{ animation: 'fadeUp .35s ease' }}>
        <div className="home-dc-section" style={{ padding: '80px 34px', minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '100%', maxWidth: 420, textAlign: 'center' }}>
            <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.14em', color: RED, textTransform: 'uppercase' }}>ADMIN DASHBOARD</span>
            <h1 style={{ fontFamily: SYNE, fontWeight: 800, fontSize: 28, color: PAGE_INK, margin: '10px 0 6px' }}>Admin wallet required</h1>
            <p style={{ fontFamily: MONO, fontSize: 10, color: PAGE_MUT, marginBottom: 8, lineHeight: 1.7 }}>
              This page is restricted to the contract owner wallet.
            </p>
            <p style={{ fontFamily: MONO, fontSize: 9, color: PAGE_INK, marginBottom: 24 }}>
              Connected: <span style={{ color: RED }}>{short}</span>
            </p>
            <button
              onClick={() => {
                sessionStorage.removeItem('sal.adminKey');
                sessionStorage.removeItem('sal.adminKey.wallet');
                setKey('');
                setAuthed(false);
              }}
              style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', padding: '10px 24px', borderRadius: 8, background: 'transparent', border: `1px solid ${BD}`, color: PAGE_MUT, cursor: 'pointer', textTransform: 'uppercase' }}
            >
              SIGN OUT
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Dashboard ── */
  return (
    <div className="home-dc" style={{ animation: 'fadeUp .35s ease' }}>
      <div className="home-dc-section" style={{ padding: '38px 34px 80px' }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.14em', color: RED, textTransform: 'uppercase' }}>ADMIN DASHBOARD</span>
          <h1 style={{ fontFamily: SYNE, fontWeight: 800, fontSize: 'clamp(32px,4vw,52px)', color: PAGE_INK, margin: '8px 0 0', lineHeight: 1.06, letterSpacing: '-.02em' }}>
            System Control
          </h1>
        </div>

        {/* System controls */}
        <Reveal>
          <div style={{ background: SURF, border: `1px solid ${BD}`, borderRadius: 12, padding: '20px 22px', marginBottom: 24 }}>
            <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.14em', color: MUT, marginBottom: 14, textTransform: 'uppercase' }}>
              Marketplace Controls
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
              <button
                onClick={() => runGlobal(() => backend.adminPause(key))}
                style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', padding: '9px 18px', borderRadius: 6, border: `1px solid ${RED}66`, background: `${RED}18`, color: RED, cursor: 'pointer' }}
              >
                PAUSE MARKETPLACE
              </button>
              <button
                onClick={() => runGlobal(() => backend.adminUnpause(key))}
                style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', padding: '9px 18px', borderRadius: 6, border: `1px solid ${GREEN}66`, background: `${GREEN}18`, color: GREEN, cursor: 'pointer' }}
              >
                UNPAUSE MARKETPLACE
              </button>
              <button
                onClick={() => load()}
                style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', padding: '9px 18px', borderRadius: 6, border: `1px solid ${BD}`, background: 'transparent', color: MUT, cursor: 'pointer' }}
              >
                ↻ REFRESH
              </button>
            </div>
            <StatusMsg msg={msg} />
          </div>
        </Reveal>

        {/* Validator Management */}
        <Reveal delay={40}>
          <div style={{ background: SURF, border: `1px solid ${BD}`, borderRadius: 12, padding: '20px 22px', marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: validators.length === 0 && !valLoading ? 12 : 16 }}>
              <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.14em', color: MUT, textTransform: 'uppercase' }}>
                Validator Registry — {valLoading ? '…' : `${validators.length} registered`}
              </div>
              <button onClick={loadValidators} disabled={valLoading} style={{ fontFamily: MONO, fontSize: 8, background: 'transparent', border: `1px solid ${BD}`, borderRadius: 5, padding: '4px 10px', color: MUT, cursor: 'pointer', opacity: valLoading ? .5 : 1 }}>
                ↻ RELOAD
              </button>
            </div>

            {/* Warning when no validators */}
            {!valLoading && validators.length === 0 && (
              <div style={{ background: `${RED}14`, border: `1px solid ${RED}44`, borderRadius: 8, padding: '10px 14px', fontFamily: MONO, fontSize: 9, color: RED, letterSpacing: '.06em', marginBottom: 14 }}>
                ⚠ NO VALIDATORS REGISTERED — submitProject() will revert: "no independent validator available"
              </div>
            )}

            {/* Validator address list */}
            {validators.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                {validators.map((addr, i) => (
                  <div key={addr} style={{ display: 'flex', alignItems: 'center', gap: 10, background: SURF2, border: `1px solid ${BD}`, borderRadius: 7, padding: '8px 12px' }}>
                    <span style={{ fontFamily: MONO, fontSize: 7, color: GREEN, background: `${GREEN}18`, borderRadius: 3, padding: '2px 7px', letterSpacing: '.06em' }}>#{i + 1}</span>
                    <span style={{ fontFamily: MONO, fontSize: 10, color: INK, wordBreak: 'break-all' }}>{addr}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Add validator */}
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={valInput}
                onChange={e => setValInput(e.target.value)}
                placeholder="0x… validator wallet address"
                style={{ flex: 1, fontFamily: MONO, fontSize: 10, background: SURF2, border: `1px solid ${BD}`, borderRadius: 6, padding: '8px 12px', color: INK, outline: 'none' }}
              />
              <button
                disabled={valBusy || !valInput.trim().startsWith('0x')}
                onClick={async () => {
                  setValBusy(true); setValMsg(null);
                  try {
                    const hash = await addValidatorOnChain(valInput.trim());
                    setValMsg(`OK · tx ${hash}`);
                    setValInput('');
                    await loadValidators();
                  } catch (e) {
                    setValMsg(errorMessage(e));
                  } finally {
                    setValBusy(false);
                  }
                }}
                style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', padding: '9px 18px', borderRadius: 6, border: `1px solid ${GREEN}66`, background: `${GREEN}18`, color: GREEN, cursor: valBusy || !valInput.trim().startsWith('0x') ? 'not-allowed' : 'pointer', opacity: valBusy || !valInput.trim().startsWith('0x') ? .45 : 1, whiteSpace: 'nowrap' }}
              >
                {valBusy ? 'ADDING…' : 'ADD VALIDATOR'}
              </button>
            </div>
            <StatusMsg msg={valMsg} />
          </div>
        </Reveal>

        {/* Pending projects */}
        <Reveal delay={80}>
          <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.14em', color: PAGE_MUT, marginBottom: 14, textTransform: 'uppercase' }}>
            Pending Projects — {loading ? '…' : projects.length} found
          </div>
        </Reveal>

        {loading && (
          <div style={{ fontFamily: MONO, fontSize: 10, color: PAGE_MUT, padding: '40px 0', textAlign: 'center', letterSpacing: '.08em' }}>
            LOADING…
          </div>
        )}

        {!loading && projects.length === 0 && (
          <Reveal>
            <div style={{ background: SURF, border: `1px solid ${BD}`, borderRadius: 12, padding: '28px 22px', textAlign: 'center' }}>
              <span style={{ fontFamily: MONO, fontSize: 10, color: MUT, letterSpacing: '.08em' }}>NO PENDING PROJECTS</span>
            </div>
          </Reveal>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {projects.map((p, i) => (
            <Reveal key={p._id} delay={i * 50}>
              <ProjectRow
                project={p}
                vote={p.onChainProjectId != null ? votes[p.onChainProjectId] : undefined}
                adminKey={key}
                onDone={() => load()}
                onMsg={setMsg}
              />
            </Reveal>
          ))}
        </div>

        {/* Validator link note */}
        <Reveal delay={120}>
          <div style={{ marginTop: 32, background: `${GOLD}11`, border: `1px solid ${GOLD}33`, borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: MONO, fontSize: 9, color: PAGE_GOLD, letterSpacing: '.08em' }}>
              VALIDATOR VOTES → use the{' '}
              <a href="/validator" style={{ color: PAGE_GOLD, textDecoration: 'underline' }}>Validator Dashboard</a>
              {' '}for the full voting interface.
            </span>
          </div>
        </Reveal>
      </div>

      <div style={{ borderTop: `1px solid ${BD}`, fontFamily: MONO, fontSize: 7, letterSpacing: '.13em', textTransform: 'uppercase', color: PAGE_MUT, padding: '20px 34px', textAlign: 'center' }}>
        © 2026 SALX | SAOLA CARBON MARKETPLACE. POWERED BY AVALANCHE.
      </div>
    </div>
  );
}
