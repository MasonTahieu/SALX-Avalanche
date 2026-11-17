import { Suspense, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { useWallet } from '../../contexts/WalletContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { env } from '../../config/env';
import { NETWORKS, networkById } from '../../config/networks';
import type { WalletKind } from '../../services/blockchain';
import { useServerWaking } from '../../services/serverStatus';
import { TEST_AVAX_FAUCET_URL } from '../../lib/walletFunding';
import { FundingNotice } from '../wallet/FundingNotice';
import { CursorAmbientGlow } from '../ui/CursorAmbientGlow';
import './AppShell.css';

const MONO = "'JetBrains Mono', monospace";
const SYNE = "'Be Vietnam Pro', sans-serif";
const INTER = "'Inter', sans-serif";

type Role = 'user' | 'validator';

type NavItem = { to: string; key: string };

const USER_NAV: NavItem[] = [
  { to: '/marketplace', key: 'nav.marketplace' },
  { to: '/retire',      key: 'nav.retire' },
  { to: '/submit',      key: 'nav.submit' },
  { to: '/dashboard',   key: 'nav.dashboard' },
  { to: '/leaderboard', key: 'nav.leaderboard' },
  { to: '/proof',       key: 'nav.proof' },
];

const VALIDATOR_NAV: NavItem[] = [
  { to: '/validator', key: 'nav.pendingProjects' },
  { to: '/admin',     key: 'nav.admin' },
];

// Must match the breakpoint in AppShell.css where the inline nav comes back.
const DESKTOP_NAV_QUERY = '(min-width: 1024px)';

function networkLabel(chainId: number | undefined): string {
  return networkById(chainId ?? null)?.shortName ?? `Chain ${chainId ?? '?'}`;
}

function shortAddr(addr: string): string {
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}

export function AppShell() {
  const wallet = useWallet();
  const serverWaking = useServerWaking();
  const navigate = useNavigate();
  const location = useLocation();
  const navigationType = useNavigationType();
  const { theme, toggleTheme } = useTheme();
  const { language, toggleLanguage, t } = useLanguage();

  const [selectedRole, setSelectedRole] = useState<Role>('user');
  const [netOpen, setNetOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const netRef = useRef<HTMLDivElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const pendingRoleRef = useRef<Role>('user');
  const connectingFromModalRef = useRef(false);
  const previousPathRef = useRef(location.pathname);

  useEffect(() => {
    const pathChanged = previousPathRef.current !== location.pathname;
    previousPathRef.current = location.pathname;
    if (pathChanged && navigationType !== 'POP' && !location.hash) {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [location.pathname, location.hash, navigationType]);

  // Close the mobile menu whenever the route changes (link tap, back button…)
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname, location.search]);

  // Mobile menu: Escape closes it; widening to desktop drops it.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        menuBtnRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    const mq = typeof window.matchMedia === 'function' ? window.matchMedia(DESKTOP_NAV_QUERY) : null;
    const onWide = () => { if (mq?.matches) setMenuOpen(false); };
    mq?.addEventListener('change', onWide);
    return () => {
      document.removeEventListener('keydown', onKey);
      mq?.removeEventListener('change', onWide);
    };
  }, [menuOpen]);

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

  // After connecting, a user stays on the current page so an action in progress
  // (such as a purchase) can continue; only validators move to their own page.
  useEffect(() => {
    if (connectingFromModalRef.current && wallet.address && !wallet.connecting) {
      connectingFromModalRef.current = false;
      wallet.setRole(pendingRoleRef.current);
      if (pendingRoleRef.current === 'validator') navigate('/validator');
    }
  }, [wallet.address, wallet.connecting, navigate, wallet.setRole]);

  const openModal = () => {
    setSelectedRole('user');
    wallet.openRoleModal();
  };

  const closeModal = () => {
    wallet.closeWalletModal();
  };

  const modalRole: Role = wallet.modalAsksRole ? selectedRole : 'user';

  const connectWith = async (kind: WalletKind) => {
    pendingRoleRef.current = modalRole;
    connectingFromModalRef.current = true;
    await wallet.connect(kind);
  };

  const isValidator = wallet.role === 'validator';
  const navItems = isValidator ? VALIDATOR_NAV : USER_NAV;
  const themeLabel = theme === 'dark' ? t('common.light') : t('common.dark');

  const navLinkStyle = (isActive: boolean): React.CSSProperties => ({
    background: 'none',
    border: 'none',
    borderBottom: `2px solid ${isActive ? 'var(--g)' : 'transparent'}`,
    cursor: 'pointer',
    padding: '8px 0',
    color: isActive ? 'var(--ink)' : 'var(--mut)',
    fontFamily: MONO,
    fontSize: 12,
    letterSpacing: '.06em',
    textTransform: 'uppercase',
    textDecoration: 'none',
    transition: 'color .2s, border-color .2s',
    whiteSpace: 'nowrap',
  });

  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: 'var(--bg)', color: 'var(--ink)' }}>
      <CursorAmbientGlow />

      {/* ── Header ── (layout + breakpoints in AppShell.css) */}
      <header className="app-hdr">

        {/* Col 1 — Logo */}
        <NavLink to="/" style={{ display: 'flex', alignItems: 'center', lineHeight: 0 }}>
          <img
            src="/assets/salx-wordmark-dark-240.webp"
            width={240}
            height={97}
            alt="SALX"
            style={{ height: 26, width: 'auto', maxWidth: 'none', filter: 'var(--logo-filter)' }}
          />
        </NavLink>

        {/* Col 2 — Nav (desktop; hidden below 1024px, see the menu panel) */}
        <nav className="app-hdr-nav" aria-label="Main">
          {navItems.map(item => (
            <NavLink key={item.to} to={item.to} style={({ isActive }) => navLinkStyle(isActive)}>
              {t(item.key)}
            </NavLink>
          ))}
          {isValidator && (
            <span style={{
              fontFamily: MONO, fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase',
              background: 'rgba(231,199,101,.1)', color: '#e7c765',
              border: '1px solid rgba(231,199,101,.3)', borderRadius: 6, padding: '3px 8px',
            }}>
              VALIDATOR
            </span>
          )}
        </nav>

        {/* Col 3 — Language + Theme toggle + Network + Wallet (+ menu button below 1024px) */}
        <div className="app-hdr-actions">
          <button
            className="app-hdr-wide-only"
            onClick={toggleLanguage}
            title="Switch language VI / EN"
            style={{
              background: 'none', border: '1px solid var(--bd)',
              color: 'var(--ink)', fontFamily: MONO, fontSize: 11, fontWeight: 600,
              letterSpacing: '.06em', padding: '6px 10px', borderRadius: 8, cursor: 'pointer',
            }}
          >
            {language === 'vi' ? 'VI' : 'EN'}
          </button>

          <button
            className="app-hdr-wide-only"
            onClick={toggleTheme}
            style={{
              background: 'none', border: '1px solid var(--bd)',
              color: 'var(--mut)', fontFamily: MONO, fontSize: 11,
              letterSpacing: '.06em', padding: '6px 10px', borderRadius: 8, cursor: 'pointer',
            }}
          >
            {themeLabel}
          </button>

          {/* Network selector */}
          <div ref={netRef} style={{ position: 'relative' }}>
            <button
              onClick={() => { setMenuOpen(false); setNetOpen(o => !o); }}
              aria-haspopup="true"
              aria-expanded={netOpen}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontFamily: MONO, fontSize: 11, letterSpacing: '.06em', fontWeight: 700,
                color: 'var(--avax)', background: 'var(--avax-bg)',
                border: '1px solid var(--avax-bd)', borderRadius: 8,
                padding: '6px 10px', cursor: 'pointer',
              }}
            >
              <span aria-hidden="true">▲</span>
              {networkLabel(wallet.chainId ?? env.chainId)}
              <span style={{ fontSize: 10, opacity: .75 }}>▾</span>
            </button>
            {netOpen && (
              <div
                style={{
                  position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                  background: 'var(--surf)', border: '1px solid var(--avax-bd)',
                  borderRadius: 10, overflow: 'hidden', zIndex: 50, minWidth: 165,
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
                        fontFamily: MONO, fontSize: 11, letterSpacing: '.06em',
                        padding: '10px 14px', cursor: 'pointer',
                        background: active ? 'var(--avax-bg)' : 'transparent',
                        color: active ? 'var(--avax)' : 'var(--ink)',
                        border: 'none', borderBottom: '1px solid var(--bd)',
                      }}
                    >
                      {active ? '✓ ' : ''}{n.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {wallet.address ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {/* Address pill */}
              <div className="app-hdr-pill" title={wallet.address} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                fontFamily: MONO, fontSize: 10, fontWeight: 500,
                background: 'var(--g)', color: 'var(--bg)',
                padding: '7px 13px', borderRadius: 999,
              }}>
                <span className="app-hdr-pill-dot" style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: 'rgba(6,17,11,.6)', flexShrink: 0,
                  animation: 'pulse 1.8s infinite',
                }} />
                {shortAddr(wallet.address)}
              </div>
              {/* Disconnect (moves into the menu panel below 640px) */}
              <button
                className="app-hdr-wide-only"
                onClick={() => wallet.disconnect()}
                title="Disconnect wallet"
                style={{
                  fontFamily: MONO, fontSize: 11, letterSpacing: '.06em',
                  background: 'none', color: '#e05252',
                  border: '1px solid rgba(224,82,82,.3)', padding: '6px 10px',
                  borderRadius: 8, cursor: 'pointer',
                }}
              >
                {t('common.disconnect')}
              </button>
            </div>
          ) : (
            <div className="app-hdr-connect">
              <button
                type="button"
                onClick={openModal}
                style={{
                  fontFamily: MONO, fontSize: 11, fontWeight: 600, letterSpacing: '.05em',
                  background: 'transparent', color: 'var(--ink)',
                  border: '1px solid var(--bd2)', padding: '7px 14px',
                  borderRadius: 999, cursor: 'pointer',
                }}
              >
                {t('common.connectWallet')}
              </button>
              {env.chainId === 43113 && (
                <a className="app-hdr-faucet" href={TEST_AVAX_FAUCET_URL} target="_blank" rel="noreferrer">
                  {t('common.getFaucet')}
                </a>
              )}
            </div>
          )}

          {/* Menu button — only displayed below 1024px */}
          <button
            ref={menuBtnRef}
            type="button"
            className="app-hdr-menu-btn"
            onClick={() => { setNetOpen(false); setMenuOpen(o => !o); }}
            aria-expanded={menuOpen}
            aria-controls="app-hdr-menu"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          >
            <span className="app-hdr-burger" aria-hidden="true"><span /><span /><span /></span>
          </button>
        </div>

        {/* Mobile / tablet menu panel */}
        {menuOpen && (
          <div id="app-hdr-menu" className="app-hdr-panel">
            {isValidator && <span className="app-hdr-panel-badge">Validator</span>}
            <nav className="app-hdr-panel-nav" aria-label="Main menu">
              {navItems.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className="app-hdr-panel-link"
                  onClick={() => setMenuOpen(false)}
                >
                  {t(item.key)}
                </NavLink>
              ))}
            </nav>
            {/* Controls that leave the header row below 640px */}
            <div className="app-hdr-panel-foot">
              <button type="button" className="app-hdr-chip" onClick={toggleLanguage}>
                {language === 'vi' ? 'VI / EN' : 'EN / VI'}
              </button>
              <button type="button" className="app-hdr-chip" onClick={toggleTheme}>
                {themeLabel}
              </button>
              {wallet.address && (
                <button
                  type="button"
                  className="app-hdr-chip app-hdr-chip--danger"
                  onClick={() => { wallet.disconnect(); setMenuOpen(false); }}
                >
                  {t('common.disconnect')}
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      {menuOpen && (
        <div className="app-hdr-backdrop" aria-hidden="true" onClick={() => setMenuOpen(false)} />
      )}

      <FundingNotice />

      {/* ── Page content ── */}
      <main className="sal-shell" style={{ padding: '32px 0', flex: 1 }}>
        {/* Pages are lazy chunks; keep the footer from jumping up while one loads. */}
        <Suspense fallback={<div aria-busy="true" style={{ minHeight: '60vh' }} />}>
          <Outlet />
        </Suspense>
      </main>

      {/* Shown only while an API request waits on a sleeping (free-tier) server. */}
      <div className="server-waking" role="status" aria-live="polite">
        {serverWaking && (
          <div className="server-waking__toast">
            <span className="server-waking__dot" aria-hidden="true" />
            <span>
              <strong>{t('common.serverWakingTitle')}</strong>
              <span className="server-waking__sub">{t('common.serverWakingSub')}</span>
            </span>
          </div>
        )}
      </div>

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
              padding: '28px 24px', width: 360, maxWidth: 'calc(100vw - 24px)',
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
                src="/assets/salx-wordmark-dark-240.webp"
                width={240}
                height={97}
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
                <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '.08em', color: 'var(--mut)' }}>
                  {t('wallet.connectingAs')} {modalRole.toUpperCase()}…
                </span>
              </div>
            )}

            {/* Unified Wallet Step with inline Role selector (defaults to User) */}
            {!wallet.connecting && (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {wallet.modalAsksRole && (
                  <div style={{ marginBottom: 16 }}>
                    <span style={{ display: 'block', fontFamily: MONO, fontSize: 11, letterSpacing: '.06em', color: 'var(--mut)', marginBottom: 8 }}>
                      {t('wallet.roleLabel')}
                    </span>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, padding: 4, borderRadius: 12, background: 'var(--surf2)', border: '1px solid var(--bd)' }}>
                      {(['user', 'validator'] as const).map((r) => {
                        const active = selectedRole === r;
                        return (
                          <button
                            key={r}
                            type="button"
                            onClick={() => setSelectedRole(r)}
                            style={{
                              padding: '8px 10px',
                              borderRadius: 8,
                              border: 'none',
                              cursor: 'pointer',
                              fontFamily: INTER,
                              fontSize: 12,
                              fontWeight: 600,
                              background: active ? (r === 'validator' ? 'rgba(231,199,101,.18)' : 'var(--gd)') : 'transparent',
                              color: active ? (r === 'validator' ? 'var(--gold)' : 'var(--g-text)') : 'var(--mut)',
                              transition: 'background .15s, color .15s',
                            }}
                          >
                            {r === 'user' ? t('wallet.roleUser') : t('wallet.roleValidator')}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div style={{
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'space-between', marginBottom: 12,
                }}>
                  <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '.06em', color: 'var(--mut)' }}>
                    {t('wallet.selectWallet')}
                  </span>
                  <span style={{
                    fontFamily: MONO, fontSize: 10, fontWeight: 600,
                    color: modalRole === 'validator' ? 'var(--gold)' : 'var(--g-text)',
                    background: modalRole === 'validator'
                      ? 'rgba(231,199,101,.12)' : 'var(--gb)',
                    padding: '3px 8px', borderRadius: 6, letterSpacing: '.06em',
                  }}>
                    {modalRole.toUpperCase()}
                  </span>
                </div>

                {/* Email or Google, for visitors without a wallet */}
                {env.privyAppId && modalRole === 'user' && (
                  <button
                    onClick={() => connectWith('privy')}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      background: 'var(--gb)', border: '1px solid var(--gd)',
                      borderRadius: 12, marginBottom: 10,
                      padding: '14px 16px', cursor: 'pointer', width: '100%', textAlign: 'left',
                    }}
                  >
                    <span style={{
                      width: 36, height: 36, background: 'var(--g)',
                      borderRadius: 10, display: 'grid', placeItems: 'center',
                      fontFamily: SYNE, fontWeight: 800, fontSize: 15, color: 'var(--bg)', flexShrink: 0,
                    }}>@</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: SYNE, fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>{t('wallet.privyTitle')}</div>
                      <div style={{ fontFamily: INTER, fontSize: 12, color: 'var(--mut)', marginTop: 2 }}>{t('wallet.privySub')}</div>
                    </div>
                    <span style={{ color: 'var(--g)', fontSize: 14 }}>→</span>
                  </button>
                )}

                {/* Core (Avalanche) */}
                <button
                  onClick={() => connectWith('core')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    background: 'var(--surf2)', border: '1px solid var(--bd)',
                    borderRadius: '12px 12px 0 0',
                    padding: '14px 16px', cursor: 'pointer', width: '100%', textAlign: 'left',
                  }}
                >
                  <span style={{
                    width: 36, height: 36, background: '#E84142',
                    borderRadius: 10, display: 'grid', placeItems: 'center',
                    fontFamily: SYNE, fontWeight: 800, fontSize: 14, color: '#fff', flexShrink: 0,
                  }}>▲</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: SYNE, fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>Core Wallet</div>
                    <div style={{ fontFamily: INTER, fontSize: 12, color: 'var(--mut)', marginTop: 2 }}>{t('wallet.coreSub')}</div>
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
                    width: 36, height: 36, background: '#F6851B',
                    borderRadius: 10, display: 'grid', placeItems: 'center',
                    fontFamily: SYNE, fontWeight: 800, fontSize: 14, color: '#fff', flexShrink: 0,
                  }}>M</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: SYNE, fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>MetaMask</div>
                    <div style={{ fontFamily: INTER, fontSize: 12, color: 'var(--mut)', marginTop: 2 }}>{t('wallet.metamaskSub')}</div>
                  </div>
                  <span style={{ color: 'var(--mut)', fontSize: 12 }}>↗</span>
                </button>

                {/* Coin98 */}
                <button
                  onClick={() => connectWith('coin98')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    background: 'var(--surf2)', border: '1px solid var(--bd)', borderTop: 'none',
                    borderRadius: '0 0 12px 12px',
                    padding: '14px 16px', cursor: 'pointer', width: '100%', textAlign: 'left',
                  }}
                >
                  <span style={{
                    width: 36, height: 36, background: '#F5A623',
                    borderRadius: 10, display: 'grid', placeItems: 'center',
                    fontFamily: SYNE, fontWeight: 800, fontSize: 13, color: '#fff', flexShrink: 0,
                  }}>98</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: SYNE, fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>Coin98</div>
                    <div style={{ fontFamily: INTER, fontSize: 12, color: 'var(--mut)', marginTop: 2 }}>{t('wallet.coin98Sub')}</div>
                  </div>
                  <span style={{ color: 'var(--mut)', fontSize: 12 }}>↗</span>
                </button>

                {wallet.error && (
                  <p style={{
                    fontFamily: MONO, fontSize: 12, color: 'var(--sal-danger)',
                    textAlign: 'center', margin: '12px 0 0',
                  }}>
                    {wallet.error}
                  </p>
                )}

                <p style={{
                  fontFamily: INTER, fontSize: 12,
                  color: 'var(--faint)', textAlign: 'center', margin: '14px 0 0',
                }}>
                  {t('wallet.approveNote')}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
