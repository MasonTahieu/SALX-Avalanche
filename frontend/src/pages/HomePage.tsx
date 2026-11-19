import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  Award,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Coins,
  ExternalLink,
  FileCheck2,
  Flame,
  Layers,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Wallet,
  Zap,
} from 'lucide-react';
import { env } from '../config/env';
import { backend } from '../services/backend';
import { projectDisplay } from '../lib/projectMeta';
import { formatNumber } from '../lib/format';
import { FootprintCalculator } from '../components/home/FootprintCalculator';
import { certBadge } from '../components/marketplace/certBadge';
import { getCurrencyEstimates } from '../lib/currency';
import { ProjectCover } from '../components/project/ProjectCover';
import { CardSwap, Card, type CardSwapHandle } from '../components/ui/CardSwap';
import { EmptyState, ErrorState, LoadingSkeleton } from '../components/ui/StateViews';
import { useLanguage } from '../contexts/LanguageContext';
import type { Listing, Project, Stats } from '../types/domain';
import './HomePage.css';

function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('is-visible');
          obs.disconnect();
        }
      },
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

function CountUpNumber({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    const reduced = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setDisplay(value);
      return;
    }
    const duration = 650;
    const t0 = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(value * eased);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <span className="tabular-nums">{formatNumber(display, decimals, 'en-US')}</span>;
}

interface EditionCard {
  id: string;
  title: string;
  meta: string;
  price: string;
  remainingAmount: number;
  badge: string;
  badgeBg: string;
  badgeColor: string;
  artBg: string;
  project: Project;
  projectId: number;
}

const ART_BACKGROUNDS = [
  'linear-gradient(155deg,#081529 0%,#0f293a 100%)',
  'linear-gradient(155deg,#071b24 0%,#0d303c 100%)',
  'linear-gradient(155deg,#0e1428 0%,#182647 100%)',
];
const MAX_EDITIONS = 12;

function buildEditions(listings: Listing[], projects: Project[]): EditionCard[] {
  const projectsById = new Map<number, Project>();
  for (const project of projects) {
    if (project.onChainProjectId != null && !project.blacklisted) {
      projectsById.set(project.onChainProjectId, project);
    }
  }
  const cheapest = new Map<number, Listing>();
  for (const listing of listings) {
    if (!listing.active || listing.remainingAmount <= 0 || !projectsById.has(listing.projectId)) continue;
    const current = cheapest.get(listing.projectId);
    if (!current || Number(listing.pricePerUnitETH) < Number(current.pricePerUnitETH)) {
      cheapest.set(listing.projectId, listing);
    }
  }
  return [...cheapest.values()]
    .sort((a, b) => a.projectId - b.projectId)
    .slice(0, MAX_EDITIONS)
    .map((listing) => {
      const project = projectsById.get(listing.projectId)!;
      const details = projectDisplay(project);
      const badge = certBadge(details.methodology);
      return {
        id: `SAL-${String(listing.projectId).padStart(4, '0')}`,
        title: project.projectName || `SAL Project #${listing.projectId}`,
        meta: [`ID: ${listing.projectId}`, details.location].filter(Boolean).join(' · '),
        price: `${listing.pricePerUnitETH} ${env.nativeSymbol}/SAL`,
        estimate: getCurrencyEstimates(listing.pricePerUnitETH).label,
        remainingAmount: listing.remainingAmount,
        badge: badge.label,
        badgeBg: badge.bg,
        badgeColor: badge.color,
        artBg: ART_BACKGROUNDS[listing.projectId % ART_BACKGROUNDS.length],
        project,
        projectId: listing.projectId,
      };
    });
}

const hasSampleCertificate =
  env.chainId === 43113 &&
  env.certificateAddress.toLowerCase() === '0xb6093fbe46ba1c0222f0d24d829eb7f310d314c7';

export function HomePage() {
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const swapRef = useRef<CardSwapHandle>(null);

  const [stats, setStats] = useState<Stats | null>(null);
  const [activeListingsCount, setActiveListingsCount] = useState<number>(0);
  const [editionsState, setEditionsState] = useState<{
    status: 'loading' | 'ready' | 'error';
    editions: EditionCard[];
  }>({ status: 'loading', editions: [] });
  const [activeSwapIdx, setActiveSwapIdx] = useState(0);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setEditionsState((prev) => ({ ...prev, status: 'loading' }));

    Promise.allSettled([
      backend.stats(),
      backend.listings({ active: true }),
      backend.projects('approved'),
    ]).then(([statsRes, listingsRes, projectsRes]) => {
      if (cancelled) return;
      if (statsRes.status === 'fulfilled') setStats(statsRes.value);
      if (listingsRes.status === 'fulfilled' && projectsRes.status === 'fulfilled') {
        setActiveListingsCount(listingsRes.value.filter((l) => l.active && l.remainingAmount > 0).length);
        setEditionsState({
          status: 'ready',
          editions: buildEditions(listingsRes.value, projectsRes.value),
        });
      } else {
        setEditionsState({ status: 'error', editions: [] });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [reloadTick]);

  const activeEdition = editionsState.editions[activeSwapIdx] ?? editionsState.editions[0] ?? null;

  const openProjectOnMarketplace = (projectId: number) => {
    navigate(`/marketplace?projectId=${projectId}`);
  };

  const contracts = [
    {
      name: 'SAL1155',
      std: 'ERC-1155',
      role: language === 'vi' ? 'Token tín chỉ carbon (1 SAL = 10 kg CO₂e)' : 'Carbon credit token (1 SAL = 10 kg CO₂e)',
      address: env.sal1155Address,
    },
    {
      name: 'GreenCertificateSBT',
      std: 'ERC-721 Soulbound',
      role: language === 'vi' ? 'Chứng chỉ xanh không thể chuyển nhượng' : 'Non-transferable green retirement certificate',
      address: env.certificateAddress,
    },
    {
      name: 'SALMarketplace',
      std: 'Core Escrow & Governance',
      role: language === 'vi' ? 'Nộp dự án, vote validator, niêm yết & retire' : 'Project registry, validator voting, escrow & retire',
      address: env.marketplaceAddress,
    },
  ];

  const retiredTonnes = stats ? (stats.totalRetiredCarbon * 10) / 1000 : 0;

  return (
    <div className="home-v2" style={{ animation: 'fadeUp .35s ease' }}>
      {/* ── HERO + LIVE CARDSWAP SHOWCASE ── */}
      <section className="home-v2-hero">
        <div className="home-v2-hero-grid">
          <div>
            <div className="home-v2-avax-badge">
              <span aria-hidden="true">▲</span>
              <span>{t('home.badge')}</span>
            </div>

            <h1 className="home-v2-h1">
              {t('home.heroTitle1')}{' '}
              <span className="home-v2-gradient-text">{t('home.heroTitle2')}</span>
            </h1>

            <p className="home-v2-lead">{t('home.heroSub')}</p>

            <div className="home-v2-cta-row">
              <Link to="/marketplace" className="home-v2-btn-primary">
                <span>{t('home.ctaMarket')}</span>
                <ArrowRight size={17} />
              </Link>
              <Link to="/submit" className="home-v2-btn-secondary">
                <span>{t('home.ctaSubmit')}</span>
                <ArrowUpRight size={17} />
              </Link>
              {hasSampleCertificate && (
                <Link
                  to="/verify/2"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 13,
                    color: 'var(--g-text)',
                    padding: '8px 4px',
                    textDecoration: 'underline',
                    textUnderlineOffset: 4,
                  }}
                >
                  {t('home.ctaSampleCert')} ↗
                </Link>
              )}
            </div>
          </div>

          {/* Right: Interactive CardSwap right at top of HomePage */}
          <div className="home-v2-cardswap-wrap">
            {editionsState.status === 'loading' && (
              <div style={{ width: '100%', maxWidth: 360 }}>
                <LoadingSkeleton rows={1} />
              </div>
            )}

            {editionsState.status === 'error' && (
              <div style={{ width: '100%', maxWidth: 380 }}>
                <ErrorState
                  title={t('common.serverWakingTitle')}
                  description={t('common.serverWakingSub')}
                  onRetry={() => setReloadTick((n) => n + 1)}
                  retryLabel={t('common.retry')}
                />
              </div>
            )}

            {editionsState.status === 'ready' && editionsState.editions.length === 0 && (
              <div style={{ width: '100%', maxWidth: 380 }}>
                <EmptyState
                  title={t('home.featEmpty')}
                  description={t('home.heroSub')}
                  action={
                    <Link to="/submit" className="home-v2-btn-primary">
                      {t('home.ctaSubmit')} <ArrowRight size={16} />
                    </Link>
                  }
                />
              </div>
            )}

            {editionsState.status === 'ready' && editionsState.editions.length > 0 && (
              <>
                <CardSwap
                  ref={swapRef}
                  width={340}
                  height={315}
                  cardDistance={34}
                  verticalDistance={32}
                  delay={4000}
                  pauseOnHover={true}
                  skewAmount={4}
                  easing="elastic"
                  onActiveChange={(idx) => setActiveSwapIdx(idx)}
                  onCardClick={(idx) => {
                    const clicked = editionsState.editions[idx];
                    if (clicked) openProjectOnMarketplace(clicked.projectId);
                  }}
                >
                  {editionsState.editions.map((ed) => (
                    <Card key={ed.id} className="overflow-hidden cursor-pointer">
                      <div style={{ position: 'relative', height: '100%', width: '100%', display: 'flex', flexDirection: 'column', background: ed.artBg }}>
                        <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
                          <ProjectCover project={ed.project} projectId={ed.projectId} />
                          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(5,10,20,0.92) 8%, rgba(5,10,20,0.22) 58%, transparent 100%)' }} />
                          <span
                            style={{
                              position: 'absolute',
                              top: 12,
                              left: 12,
                              fontFamily: 'var(--font-mono)',
                              fontSize: 11,
                              fontWeight: 600,
                              padding: '4px 10px',
                              borderRadius: 999,
                              background: ed.badgeBg,
                              color: ed.badgeColor,
                            }}
                          >
                            {ed.badge}
                          </span>
                          <span
                            style={{
                              position: 'absolute',
                              top: 12,
                              right: 12,
                              fontFamily: 'var(--font-mono)',
                              fontSize: 11,
                              padding: '4px 10px',
                              borderRadius: 999,
                              background: 'rgba(5,10,20,0.75)',
                              color: '#F1F5F9',
                              border: '1px solid rgba(148,163,184,0.32)',
                            }}
                          >
                            {ed.id}
                          </span>
                        </div>
                        <div style={{ padding: '14px 16px', background: 'var(--surf)', borderTop: '1px solid var(--bd)' }}>
                          <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>
                            {ed.title}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--mut)' }}>{ed.meta}</span>
                            <div style={{ textAlign: 'right' }}>
                              <strong style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--g-text)' }}>{ed.price}</strong>
                              <span style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--mut)' }}>≈ {ed.estimate}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </CardSwap>

                {/* Prev / Dots / Next controls */}
                <div className="home-v2-swap-controls">
                  <button
                    type="button"
                    className="home-v2-swap-btn"
                    onClick={() => swapRef.current?.prev()}
                    aria-label={language === 'vi' ? 'Dự án trước' : 'Previous project'}
                  >
                    <ChevronLeft size={18} />
                  </button>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {editionsState.editions.map((ed, idx) => {
                      const active = idx === activeSwapIdx;
                      return (
                        <button
                          key={ed.id}
                          type="button"
                          onClick={() => swapRef.current?.goTo(idx)}
                          aria-label={ed.title}
                          style={{
                            width: active ? 22 : 8,
                            height: 8,
                            borderRadius: 999,
                            border: 'none',
                            cursor: 'pointer',
                            background: active ? 'var(--g)' : 'var(--bd2)',
                            transition: 'width 0.2s ease, background 0.2s ease',
                          }}
                        />
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    className="home-v2-swap-btn"
                    onClick={() => swapRef.current?.next()}
                    aria-label={language === 'vi' ? 'Dự án tiếp theo' : 'Next project'}
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>

                {activeEdition && (
                  <button
                    type="button"
                    onClick={() => openProjectOnMarketplace(activeEdition.projectId)}
                    style={{
                      marginTop: 10,
                      background: 'none',
                      border: 'none',
                      color: 'var(--cyan)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 12,
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      textUnderlineOffset: 4,
                    }}
                  >
                    {language === 'vi' ? `Xem & mua "${activeEdition.title}" →` : `Inspect & buy "${activeEdition.title}" →`}
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Live On-chain / API Stats */}
        <div className="home-v2-stats-grid">
          <div className="home-v2-card">
            <span style={{ display: 'block', fontSize: 13, color: 'var(--mut)', marginBottom: 6 }}>
              {t('home.statProjects')}
            </span>
            <strong style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 700, color: 'var(--ink)' }}>
              {stats ? <CountUpNumber value={stats.totalApprovedProjects} /> : '—'}
            </strong>
          </div>
          <div className="home-v2-card">
            <span style={{ display: 'block', fontSize: 13, color: 'var(--mut)', marginBottom: 6 }}>
              {t('home.statRetired')}
            </span>
            <strong style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 700, color: 'var(--g-text)' }}>
              {stats ? <CountUpNumber value={retiredTonnes} decimals={2} /> : '—'}
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--mut)', marginLeft: 6 }}>tCO₂e</span>
            </strong>
          </div>
          <div className="home-v2-card">
            <span style={{ display: 'block', fontSize: 13, color: 'var(--mut)', marginBottom: 6 }}>
              {t('home.statSupply')}
            </span>
            <strong style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 700, color: 'var(--cyan)' }}>
              {stats ? <CountUpNumber value={stats.totalAvailableCarbon} /> : '—'}
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--mut)', marginLeft: 6 }}>SAL</span>
            </strong>
          </div>
          <div className="home-v2-card">
            <span style={{ display: 'block', fontSize: 13, color: 'var(--mut)', marginBottom: 6 }}>
              {t('home.statTx')}
            </span>
            <strong style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 700, color: 'var(--gold)' }}>
              {editionsState.status === 'ready' ? <CountUpNumber value={activeListingsCount} /> : '—'}
            </strong>
          </div>
        </div>
      </section>

      {/* ── 01 / THE PROBLEM ── */}
      <Reveal>
        <section className="home-v2-section">
          <span className="home-v2-tag">{t('home.probTag')}</span>
          <h2 className="home-v2-h2">{t('home.probTitle')}</h2>

          <div className="home-v2-grid-3">
            {[
              { icon: <Layers size={20} />, title: t('home.prob1Title'), desc: t('home.prob1Desc'), color: 'var(--avax)' },
              { icon: <ShieldAlert size={20} />, title: t('home.prob2Title'), desc: t('home.prob2Desc'), color: 'var(--gold)' },
              { icon: <FileCheck2 size={20} />, title: t('home.prob3Title'), desc: t('home.prob3Desc'), color: 'var(--g-text)' },
            ].map((item) => (
              <div key={item.title} className="home-v2-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 12,
                    display: 'grid',
                    placeItems: 'center',
                    background: 'var(--surf2)',
                    border: '1px solid var(--bd)',
                    color: item.color,
                  }}
                >
                  {item.icon}
                </div>
                <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 700 }}>{item.title}</h3>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65, color: 'var(--mut)' }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </Reveal>

      {/* ── 02 / HOW IT WORKS (4 STEPS) ── */}
      <Reveal>
        <section className="home-v2-section">
          <span className="home-v2-tag">{t('home.flowTag')}</span>
          <h2 className="home-v2-h2">{t('home.flowTitle')}</h2>

          <div className="home-v2-grid-4">
            {[
              { step: '01', icon: <FileCheck2 size={18} />, title: t('home.step1Title'), desc: t('home.step1Desc') },
              { step: '02', icon: <CheckCircle2 size={18} />, title: t('home.step2Title'), desc: t('home.step2Desc') },
              { step: '03', icon: <Coins size={18} />, title: t('home.step3Title'), desc: t('home.step3Desc') },
              { step: '04', icon: <Flame size={18} />, title: t('home.step4Title'), desc: t('home.step4Desc') },
            ].map((s) => (
              <div key={s.step} className="home-v2-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--cyan)' }}>
                    STEP {s.step}
                  </span>
                  <span style={{ color: 'var(--mut)' }}>{s.icon}</span>
                </div>
                <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700 }}>{s.title}</h3>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--mut)' }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </Reveal>

      {/* ── 03 / ON-CHAIN PROOF ── */}
      <Reveal>
        <section className="home-v2-section">
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <span className="home-v2-tag">{t('home.proofTag')}</span>
              <h2 className="home-v2-h2">{t('home.proofTitle')}</h2>
              <p className="home-v2-lead" style={{ marginTop: 12 }}>{t('home.proofSub')}</p>
            </div>
            <Link to="/proof" className="home-v2-btn-secondary">
              <span>{t('home.proofFullLink')}</span>
            </Link>
          </div>

          <div className="home-v2-grid-3">
            {contracts.map((c) => {
              const hasAddr = Boolean(c.address && c.address !== '0x...');
              return (
                <div key={c.name} className="home-v2-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <strong style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>{c.name}</strong>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        padding: '3px 8px',
                        borderRadius: 999,
                        background: 'var(--gb)',
                        border: '1px solid var(--gd)',
                        color: 'var(--g-text)',
                      }}
                    >
                      {c.std}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: 14, color: 'var(--mut)' }}>{c.role}</p>
                  <div style={{ marginTop: 'auto', paddingTop: 10, borderTop: '1px solid var(--bd-soft)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink)' }}>
                      {hasAddr ? `${c.address.slice(0, 8)}…${c.address.slice(-6)}` : 'Configured in env'}
                    </code>
                    {hasAddr && (
                      <a
                        href={`${env.blockExplorerUrl}/address/${c.address}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--avax)' }}
                      >
                        Snowtrace <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </Reveal>

      {/* ── FOOTPRINT CALCULATOR ── */}
      <FootprintCalculator />

      {/* ── 05 / CERTIFICATE SHOWCASE ── */}
      <Reveal>
        <section className="home-v2-section">
          <div className="home-v2-split">
            <div>
              <span className="home-v2-tag">{t('home.certTag')}</span>
              <h2 className="home-v2-h2">{t('home.certTitle')}</h2>
              <p className="home-v2-lead" style={{ marginTop: 14 }}>{t('home.certDesc')}</p>
              <div className="home-v2-cta-row">
                <button type="button" onClick={() => navigate('/retire')} className="home-v2-btn-primary">
                  <span>{t('home.certBtn')}</span>
                  <Flame size={17} />
                </button>
                {hasSampleCertificate && (
                  <Link to="/verify/2" className="home-v2-btn-secondary">
                    <span>{t('home.certVerifyBtn')}</span>
                    <ArrowUpRight size={17} />
                  </Link>
                )}
              </div>
            </div>

            <div
              className="home-v2-card"
              style={{
                borderColor: 'var(--gd)',
                background: 'linear-gradient(145deg, var(--surf), var(--surf2))',
                boxShadow: '0 24px 64px rgba(0, 0, 0, 0.34)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--g-text)' }}>
                  <Award size={16} /> SOULBOUND GREEN CERTIFICATE
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--gold)' }}>ERC-721 SBT</span>
              </div>
              <div style={{ padding: 16, borderRadius: 12, background: 'var(--bg)', border: '1px solid var(--bd)' }}>
                <div style={{ fontSize: 12, color: 'var(--mut)' }}>Verified Offset Amount</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 700, color: 'var(--g-text)', marginTop: 4 }}>
                  120 kg CO₂e <span style={{ fontSize: 13, color: 'var(--mut)', fontWeight: 500 }}>(12 SAL burned)</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--bd-soft)', fontSize: 12 }}>
                  <div>
                    <span style={{ color: 'var(--mut)', display: 'block' }}>Audit Trail</span>
                    <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink)' }}>EIP-712 + IPFS MRV</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--mut)', display: 'block' }}>Transferability</span>
                    <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--avax)' }}>Non-transferable</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </Reveal>

      {/* ── 06 / WHY AVALANCHE ── */}
      <Reveal>
        <section className="home-v2-section">
          <span className="home-v2-tag" style={{ color: 'var(--avax)' }}>{t('home.avaxTag')}</span>
          <h2 className="home-v2-h2">{t('home.avaxTitle')}</h2>

          <div className="home-v2-grid-3">
            {[
              { icon: <Zap size={20} />, title: t('home.avax1Title'), desc: t('home.avax1Desc') },
              { icon: <Sparkles size={20} />, title: t('home.avax2Title'), desc: t('home.avax2Desc') },
              { icon: <Wallet size={20} />, title: t('home.avax3Title'), desc: t('home.avax3Desc') },
            ].map((item) => (
              <div key={item.title} className="home-v2-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'var(--avax-bg)', color: 'var(--avax)', border: '1px solid var(--avax-bd)' }}>
                  {item.icon}
                </div>
                <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700 }}>{item.title}</h3>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65, color: 'var(--mut)' }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </Reveal>

      {/* ── FINAL CTA & FOOTER ── */}
      <Reveal>
        <section className="home-v2-section" style={{ textAlign: 'center' }}>
          <div
            className="home-v2-card"
            style={{
              padding: 'clamp(28px, 5vw, 56px)',
              borderColor: 'var(--gd)',
              background: 'linear-gradient(135deg, var(--surf), var(--surf2))',
            }}
          >
            <ShieldCheck size={32} style={{ color: 'var(--g-text)', margin: '0 auto 14px' }} />
            <h2 className="home-v2-h2" style={{ maxWidth: 760, margin: '0 auto' }}>{t('home.finalTitle')}</h2>
            <p className="home-v2-lead" style={{ margin: '14px auto 0' }}>{t('home.finalSub')}</p>
            <div className="home-v2-cta-row" style={{ justifyContent: 'center' }}>
              <Link to="/marketplace" className="home-v2-btn-primary">
                {t('home.ctaMarket')} <ArrowRight size={17} />
              </Link>
              <Link to="/retire" className="home-v2-btn-secondary">
                {t('home.certBtn')} <Flame size={17} />
              </Link>
            </div>
          </div>

          <footer
            style={{
              marginTop: 40,
              paddingTop: 24,
              borderTop: '1px solid var(--bd-soft)',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              fontSize: 13,
              color: 'var(--mut)',
            }}
          >
            <span>© 2026 SALX · {t('home.footerTeam')}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <a href="https://github.com/MasonTahieu/SALX-Avalanche" target="_blank" rel="noreferrer" style={{ color: 'var(--ink)' }}>
                GitHub ↗
              </a>
              <Link to="/proof" style={{ color: 'var(--ink)' }}>Proof</Link>
              <a href="mailto:hello@salx.io" style={{ color: 'var(--ink)' }}>hello@salx.io</a>
            </div>
          </footer>
        </section>
      </Reveal>
    </div>
  );
}
