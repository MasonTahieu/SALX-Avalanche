import { Suspense, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useWallet } from '../../contexts/WalletContext';
import { useTheme } from '../../contexts/ThemeContext';
import { env } from '../../config/env';
import { NETWORKS, networkById } from '../../config/networks';
import type { WalletKind } from '../../services/blockchain';

const MONO = "'JetBrains Mono', monospace";
const SYNE = "'Syne', sans-serif";
const INTER = "'Inter', sans-serif";

type ModalStep = 'role' | 'wallet';
type Role = 'user' | 'validator';

function networkLabel(chainId: number | undefined): string {
  return networkById(chainId ?? null)?.shortName ?? `Chain ${chainId ?? '?'}`;
}

function shortAddr(addr: string): string {
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}

export function AppShell() {
  const wallet = useWallet();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  const [modalStep, setModalStep] = useState<ModalStep>('role');
  const [netOpen, setNetOpen] = useState(false);
  const netRef = useRef<HTMLDivElement>(null);
  const pendingRoleRef = useRef<Role>('user');
  const connectingFromModalRef = useRef(false);

  // Close network dropdown on outside click
  useEffect(() => {
    if (!netOpen) return;
    const handler = (e: MouseEvent) => {
      if (netRef.current && !netRef.current.contains(e.target as Node)) {
        setNetOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [netOpen]);

  // Navigate after successful wallet connection from modal
  useEffect(() => {
    if (connectingFromModalRef.current && wallet.address && !wallet.connecting) {
      connectingFromModalRef.current = false;
      setModalStep('role');
      wallet.setRole(pendingRoleRef.current);
      navigate(pendingRoleRef.current === 'validator' ? '/validator' : '/');
    }
  }, [wallet.address, wallet.connecting, navigate, wallet.setRole]);

  const openModal = () => {
    setModalStep('role');
    wallet.openWalletModal();
  };

  const closeModal = () => {
    wallet.closeWalletModal();
    setModalStep('role');
  };

  const selectRole = (r: Role) => {
    pendingRoleRef.current = r;
    setModalStep('wallet');
  };

  const connectWith = async (kind: WalletKind) => {
    connectingFromModalRef.current = true;
    await wallet.connect(kind);
  };

  const isValidator = wallet.role === 'validator';
  const themeLabel = theme === 'dark' ? 'LIGHT' : 'DARK';

  const navLinkStyle = (isActive: boolean): React.CSSProperties => ({
    background: 'none',
    border: 'none',
    borderBottom: `1px solid ${isActive ? 'var(--ink)' : 'transparent'}`,
    cursor: 'pointer',
    padding: '8px 0',
    color: isActive ? 'var(--ink)' : 'var(--mut)',
    fontFamily: MONO,
    fontSize: 12,
    letterSpacing: '.07em',
    textTransform: 'uppercase',
    textDecoration: 'none',
    transition: 'color .2s, border-color .2s',
    whiteSpace: 'nowrap',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: 'var(--bg)', color: 'var(--ink)' }}>

      {/* ── Header ── */}
      <header style={{
        height: 64, flexShrink: 0,
        display: 'grid', gridTemplateColumns: 'auto 1fr auto',
        alignItems: 'center', gap: 18, padding: '0 32px',
        borderBottom: '1px solid rgba(45,201,34,.18)',
        background: 'var(--hdr)', backdropFilter: 'blur(16px)',
        position: 'sticky', top: 0, zIndex: 40,
      }}>

        {/* Col 1 — Logo */}
        <NavLink to="/" style={{ display: 'flex', alignItems: 'center', lineHeight: 0 }}>
          <img
            src="/assets/salx-wordmark-dark.png"
            alt="SALX"
            style={{ height: 26, width: 'auto', maxWidth: 'none', filter: 'var(--logo-filter)' }}
          />
        </NavLink>

        {/* Col 2 — Nav */}
        <nav style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 24 }}>
          {isValidator ? (
            <>
              <NavLink to="/validator" style={({ isActive }) => navLinkStyle(isActive)}>
                Pending Projects
              </NavLink>
              <NavLink to="/admin" style={({ isActive }) => navLinkStyle(isActive)}>Admin</NavLink>
              <span style={{
                fontFamily: MONO, fontSize: 7, letterSpacing: '.1em', textTransform: 'uppercase',
                background: 'rgba(231,199,101,.1)', color: '#e7c765',
                border: '1px solid rgba(231,199,101,.3)', borderRadius: 4, padding: '3px 8px',
              }}>
                VALIDATOR
              </span>
            </>
          ) : (
            <>
              <NavLink to="/marketplace" style={({ isActive }) => navLinkStyle(isActive)}>Marketplace</NavLink>
              <NavLink to="/retire"  style={({ isActive }) => navLinkStyle(isActive)}>Retire</NavLink>
              <NavLink to="/submit" style={({ isActive }) => navLinkStyle(isActive)}>Submit</NavLink>
              <NavLink to="/dashboard"   style={({ isActive }) => navLinkStyle(isActive)}>Dashboard</NavLink>
              <NavLink to="/leaderboard" style={({ isActive }) => navLinkStyle(isActive)}>Leaderboard</NavLink>
            </>
          )}
        </nav>

        {/* Col 3 — Theme toggle + Network + Wallet */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={toggleTheme}
            style={{
              background: 'none', border: '1px solid var(--bd)',
              color: 'var(--mut)', fontFamily: MONO, fontSize: 9,
              letterSpacing: '.06em', padding: '6px 10px', borderRadius: 6, cursor: 'pointer',
            }}
          >
            {themeLabel}
          </button>

          {/* Network selector */}
          <div ref={netRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setNetOpen(o => !o)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', fontWeight: 700,
                color: 'var(--g)', background: 'rgba(45,201,34,.08)',
                border: '1px solid rgba(45,201,34,.25)', borderRadius: 6,
                padding: '6px 10px', cursor: 'pointer',
              }}
            >
              {networkLabel(wallet.chainId ?? env.chainId)}
              <span style={{ fontSize: 8, opacity: .7 }}>▾</span>
            </button>
            {netOpen && (
              <div
                style={{
                  position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                  background: 'var(--surf)', border: '1px solid rgba(45,201,34,.25)',
                  borderRadius: 8, overflow: 'hidden', zIndex: 50, minWidth: 130,
                  boxShadow: '0 8px 24px rgba(0,0,0,.4)',
                }}
              >
                {NETWORKS.map(n => {
                  const active = (wallet.chainId ?? env.chainId) === n.id;
                  return (
                    <button
                      key={n.id}
                      onClick={() => { wallet.switchNetwork(n.id); setNetOpen(false); }}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        fontFamily: MONO, fontSize: 9, letterSpacing: '.08em',
                        padding: '10px 14px', cursor: 'pointer',
                        background: active ? 'rgba(45,201,34,.1)' : 'transparent',
                        color: active ? 'var(--g)' : 'var(--ink)',
                        border: 'none', borderBottom: '1px solid var(--bd)',
                      }}
                    >
                      {active && '✓ '}{n.shortName}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {wallet.address ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {/* Address pill */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                fontFamily: MONO, fontSize: 10, fontWeight: 500,
                background: 'var(--g)', color: 'var(--bg)',
                padding: '7px 13px', borderRadius: 999,
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: 'rgba(6,17,11,.6)', flexShrink: 0,
                  animation: 'pulse 1.8s infinite',
                }} />
                {shortAddr(wallet.address)}
              </div>
              {/* Disconnect */}
              <button
                onClick={() => wallet.disconnect()}
                title="Disconnect wallet"
                style={{
                  fontFamily: MONO, fontSize: 8, letterSpacing: '.06em',
                  background: 'none', color: '#e05252',
                  border: '1px solid rgba(224,82,82,.3)', padding: '6px 10px',
                  borderRadius: 6, cursor: 'pointer',
                }}
              >
                DISCONNECT
              </button>
            </div>
          ) : (
            <button
              onClick={openModal}
              style={{
                fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: '.06em',
                background: 'transparent', color: 'var(--ink)',
                border: '1px solid var(--bd2)', padding: '7px 14px',
                borderRadius: 999, cursor: 'pointer',
              }}
            >
              Connect Wallet
            </button>
          )}
        </div>
      </header>

      {/* ── Page content ── */}
      <main className="sal-shell" style={{ padding: '32px 0', flex: 1 }}>
        {/* Pages are lazy chunks; keep the footer from jumping up while one loads. */}
        <Suspense fallback={<div aria-busy="true" style={{ minHeight: '60vh' }} />}>
          <Outlet />
        </Suspense>
      </main>

      {/* ── Connect Wallet Modal ── */}
      {wallet.modalOpen && (
        <div
          onClick={closeModal}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(5,8,6,.85)', backdropFilter: 'blur(10px)',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'relative', background: 'var(--surf)',
              border: '1px solid rgba(45,201,34,.25)', borderRadius: 16,
              padding: '28px 24px', width: 360,
              animation: 'fadeUp .25s ease',
            }}
          >
            {/* Close */}
            <button
              onClick={closeModal}
              style={{
                position: 'absolute', top: 14, right: 14,
                background: 'none', border: 'none',
                color: 'var(--mut)', fontSize: 16, cursor: 'pointer', lineHeight: 1,
              }}
            >
              ×
            </button>

            {/* Wordmark */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <img
                src="/assets/salx-wordmark-dark.png"
                alt="SALX"
                style={{ height: 28, width: 'auto', display: 'inline-block', filter: 'var(--logo-filter)' }}
              />
            </div>
            <div style={{
              width: '100%', height: 1, marginBottom: 20,
              background: 'linear-gradient(90deg,transparent,rgba(45,201,34,.3),transparent)',
            }} />

            {/* Connecting spinner */}
            {wallet.connecting && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '24px 0' }}>
                <div style={{
                  width: 30, height: 30,
                  border: '2px solid rgba(45,201,34,.25)',
                  borderTopColor: 'var(--g)',
                  borderRadius: '50%',
                  animation: 'spin .8s linear infinite',
                }} />
                <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', color: 'var(--mut)' }}>
                  CONNECTING AS {pendingRoleRef.current.toUpperCase()}…
                </span>
              </div>
            )}

            {/* Step 1 — Role */}
            {!wallet.connecting && modalStep === 'role' && (
              <>
                <p style={{
                  fontFamily: INTER, fontWeight: 500, fontSize: 10, letterSpacing: '.08em',
                  textTransform: 'uppercase', color: 'var(--mut)',
                  textAlign: 'center', margin: '0 0 16px',
                }}>
                  I AM A…
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {/* USER */}
                  <button
                    onClick={() => selectRole('user')}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      background: 'var(--surf2)', border: '1px solid rgba(45,201,34,.25)',
                      borderRadius: 10, padding: 16, cursor: 'pointer', width: '100%', textAlign: 'left',
                    }}
                  >
                    <span style={{
                      width: 36, height: 36,
                      background: 'rgba(45,201,34,.14)', border: '1px solid rgba(45,201,34,.3)',
                      borderRadius: 8, display: 'grid', placeItems: 'center',
                      fontFamily: INTER, fontWeight: 700, fontSize: 13, color: 'var(--g)', flexShrink: 0,
                    }}>U</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: INTER, fontWeight: 650, fontSize: 13, letterSpacing: '.03em', textTransform: 'uppercase', color: 'var(--ink)' }}>USER</div>
                      <div style={{ fontFamily: INTER, fontWeight: 400, fontSize: 11, color: 'var(--mut)', marginTop: 3 }}>
                        Buy, sell &amp; retire carbon credits
                      </div>
                    </div>
                    <span style={{ color: 'var(--g)', fontSize: 14, lineHeight: 1, alignSelf: 'center' }}>→</span>
                  </button>

                  {/* VALIDATOR */}
                  <button
                    onClick={() => selectRole('validator')}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      background: 'var(--surf2)', border: '1px solid rgba(231,199,101,.22)',
                      borderRadius: 10, padding: 16, cursor: 'pointer', width: '100%', textAlign: 'left',
                    }}
                  >
                    <span style={{
                      width: 36, height: 36,
                      background: 'rgba(231,199,101,.12)', border: '1px solid rgba(231,199,101,.3)',
                      borderRadius: 8, display: 'grid', placeItems: 'center',
                      fontFamily: INTER, fontWeight: 700, fontSize: 13, color: '#e7c765', flexShrink: 0,
                    }}>V</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: INTER, fontWeight: 650, fontSize: 13, letterSpacing: '.03em', textTransform: 'uppercase', color: 'var(--ink)' }}>VALIDATOR</div>
                      <div style={{ fontFamily: INTER, fontWeight: 400, fontSize: 11, color: 'var(--mut)', marginTop: 3 }}>
                        Review &amp; vote on project submissions
                      </div>
                    </div>
                    <span style={{ color: '#e7c765', fontSize: 14, lineHeight: 1, alignSelf: 'center' }}>→</span>
                  </button>
                </div>
              </>
            )}

            {/* Step 2 — Wallet */}
            {!wallet.connecting && modalStep === 'wallet' && (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'space-between', marginBottom: 16,
                }}>
                  <button
                    onClick={() => setModalStep('role')}
                    style={{
                      fontFamily: MONO, fontSize: 8, letterSpacing: '.08em',
                      color: 'var(--mut)', background: 'none', border: 'none',
                      cursor: 'pointer', padding: 0,
                    }}
                  >
                    ← BACK
                  </button>
                  <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', color: 'var(--mut)' }}>
                    SELECT WALLET
                  </span>
                  <span style={{
                    fontFamily: MONO, fontSize: 8,
                    color: pendingRoleRef.current === 'validator' ? '#e7c765' : 'var(--g)',
                    background: pendingRoleRef.current === 'validator'
                      ? 'rgba(231,199,101,.1)' : 'rgba(45,201,34,.1)',
                    padding: '3px 8px', borderRadius: 4, letterSpacing: '.06em',
                  }}>
                    {pendingRoleRef.current.toUpperCase()}
                  </span>
                </div>

                {/* Core (Avalanche) */}
                <button
                  onClick={() => connectWith('core')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    background: 'var(--surf2)', border: '1px solid var(--bd)',
                    borderRadius: '10px 10px 0 0',
                    padding: '14px 16px', cursor: 'pointer', width: '100%', textAlign: 'left',
                  }}
                >
                  <span style={{
                    width: 34, height: 34, background: '#E84142',
                    borderRadius: 8, display: 'grid', placeItems: 'center',
                    fontFamily: SYNE, fontWeight: 800, fontSize: 14, color: '#fff', flexShrink: 0,
                  }}>▲</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: SYNE, fontWeight: 700, fontSize: 13, color: 'var(--ink)' }}>Core</div>
                    <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mut)', marginTop: 2 }}>Avalanche wallet</div>
                  </div>
                  <span style={{ color: 'var(--mut)', fontSize: 12 }}>↗</span>
                </button>

                {/* MetaMask */}
                <button
                  onClick={() => connectWith('metamask')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    background: 'var(--surf2)', border: '1px solid var(--bd)', borderTop: 'none',
                    borderRadius: 0,
                    padding: '14px 16px', cursor: 'pointer', width: '100%', textAlign: 'left',
                  }}
                >
                  <span style={{
                    width: 34, height: 34, background: '#F6851B',
                    borderRadius: 8, display: 'grid', placeItems: 'center',
                    fontFamily: SYNE, fontWeight: 800, fontSize: 14, color: '#fff', flexShrink: 0,
                  }}>M</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: SYNE, fontWeight: 700, fontSize: 13, color: 'var(--ink)' }}>MetaMask</div>
                    <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mut)', marginTop: 2 }}>Browser extension</div>
                  </div>
                  <span style={{ color: 'var(--mut)', fontSize: 12 }}>↗</span>
                </button>

                {/* Coin98 */}
                <button
                  onClick={() => connectWith('coin98')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    background: 'var(--surf2)', border: '1px solid var(--bd)', borderTop: 'none',
                    borderRadius: '0 0 10px 10px',
                    padding: '14px 16px', cursor: 'pointer', width: '100%', textAlign: 'left',
                  }}
                >
                  <span style={{
                    width: 34, height: 34, background: '#F5A623',
                    borderRadius: 8, display: 'grid', placeItems: 'center',
                    fontFamily: SYNE, fontWeight: 800, fontSize: 13, color: '#fff', flexShrink: 0,
                  }}>98</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: SYNE, fontWeight: 700, fontSize: 13, color: 'var(--ink)' }}>Coin98</div>
                    <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mut)', marginTop: 2 }}>Multi-chain wallet</div>
                  </div>
                  <span style={{ color: 'var(--mut)', fontSize: 12 }}>↗</span>
                </button>

                {wallet.error && (
                  <p style={{
                    fontFamily: MONO, fontSize: 8, color: 'var(--sal-danger)',
                    textAlign: 'center', margin: '12px 0 0',
                  }}>
                    {wallet.error}
                  </p>
                )}

                <p style={{
                  fontFamily: MONO, fontSize: 8, letterSpacing: '.06em',
                  color: 'var(--faint)', textAlign: 'center', margin: '16px 0 0',
                }}>
                  NON-CUSTODIAL · YOUR KEYS, YOUR CREDITS
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
