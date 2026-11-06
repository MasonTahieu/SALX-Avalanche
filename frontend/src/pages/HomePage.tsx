import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { env } from '../config/env';
import { backend } from '../services/backend';
import { projectDisplay } from '../lib/projectMeta';
import { certBadge } from '../components/marketplace/certBadge';
import type { Listing, Project } from '../types/domain';

function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add('is-visible'); obs.disconnect(); } },
      { threshold: 0.12 },
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

interface EditionCard {
  id: string;
  title: string;
  meta: string;
  price: string;
  badge: string;
  badgeBg: string;
  badgeColor: string;
  artBg: string;
}

// Card art, picked by project ID so each project keeps the same colour.
const ART_BACKGROUNDS = [
  'linear-gradient(155deg,#0a1c13 0%,#162a1c 100%)',
  'linear-gradient(155deg,#0c1e22 0%,#0e2830 100%)',
  'linear-gradient(155deg,#1e1c0a 0%,#28260e 100%)',
];
const MAX_EDITIONS = 6;

// One card per approved, non-blacklisted project that has SAL on sale, at its
// cheapest active listing. Same data and badge as the marketplace.
function buildEditions(listings: Listing[], projects: Project[]): EditionCard[] {
  const projectsById = new Map<number, Project>();
  for (const project of projects) {
    if (project.onChainProjectId != null && !project.blacklisted) projectsById.set(project.onChainProjectId, project);
  }
  const cheapest = new Map<number, Listing>();
  for (const listing of listings) {
    if (!listing.active || listing.remainingAmount <= 0 || !projectsById.has(listing.projectId)) continue;
    const current = cheapest.get(listing.projectId);
    if (!current || Number(listing.pricePerUnitETH) < Number(current.pricePerUnitETH)) cheapest.set(listing.projectId, listing);
  }
  return [...cheapest.values()]
    .sort((a, b) => a.projectId - b.projectId)
    .slice(0, MAX_EDITIONS)
    .map(listing => {
      const project = projectsById.get(listing.projectId)!;
      const details = projectDisplay(project);
      const badge = certBadge(details.methodology);
      return {
        id: `SAL-${String(listing.projectId).padStart(4, '0')}`,
        title: project.projectName || `SAL Project #${listing.projectId}`,
        meta: [`ID: ${listing.projectId}`, details.location].filter(Boolean).join(' | '),
        price: `${listing.pricePerUnitETH} ${env.nativeSymbol}/SAL`,
        badge: badge.label,
        badgeBg: badge.bg,
        badgeColor: badge.color,
        artBg: ART_BACKGROUNDS[listing.projectId % ART_BACKGROUNDS.length],
      };
    });
}

type EditionsState = { status: 'loading' | 'ready' | 'error'; editions: EditionCard[] };

function useEditions(): EditionsState {
  const [state, setState] = useState<EditionsState>({ status: 'loading', editions: [] });
  useEffect(() => {
    let cancelled = false;
    Promise.all([backend.listings({ active: true }), backend.projects('approved')])
      .then(([listings, projects]) => { if (!cancelled) setState({ status: 'ready', editions: buildEditions(listings, projects) }); })
      .catch(() => { if (!cancelled) setState({ status: 'error', editions: [] }); });
    return () => { cancelled = true; };
  }, []);
  return state;
}

const EDITION_CARD_STYLE = { flex: '0 0 calc((100% - 36px)/3)', minWidth: 250, scrollSnapAlign: 'start' } as const;

const MONO = "'JetBrains Mono', monospace";
const SYNE = "'Syne', sans-serif";

function MetaItem({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div>
      <span style={{ display: 'block', fontFamily: MONO, fontSize: 8, letterSpacing: '.13em', textTransform: 'uppercase' as const, color: 'var(--mut)', marginBottom: 10 }}>
        {label}
      </span>
      <strong style={{ fontSize: 11, fontWeight: 600, color: valueColor ?? 'var(--ink)' }}>{value}</strong>
    </div>
  );
}

export function HomePage() {
  const navigate = useNavigate();
  const editions = useEditions();
  const heroBoxRef = useRef<HTMLDivElement>(null);
  const heroSRef = useRef<HTMLSpanElement>(null);
  const heroAlRef = useRef<HTMLSpanElement>(null);

  // Split "SAL" → "S" drifts left, "AL" drifts right on scroll
  // Styles are written at most once per frame, and not at all once the hero is
  // fully scrolled past (progress stays at 1), so scrolling the rest of the
  // page does no work here.
  useEffect(() => {
    let frame = 0;
    let lastProg = -1;
    const apply = () => {
      frame = 0;
      const prog = Math.min(window.scrollY / 280, 1);
      if (prog === lastProg) return;
      lastProg = prog;
      if (heroBoxRef.current) heroBoxRef.current.style.transform = `scale(${1 - prog * 0.13}) translateZ(0)`;
      if (heroSRef.current) {
        heroSRef.current.style.transform = `translateX(${-prog * 180}px)`;
        heroSRef.current.style.opacity = String(1 - prog * 0.5);
      }
      if (heroAlRef.current) {
        heroAlRef.current.style.transform = `translateX(${prog * 180}px)`;
        heroAlRef.current.style.opacity = String(1 - prog * 0.5);
      }
    };
    const handler = () => { if (!frame) frame = requestAnimationFrame(apply); };
    apply();
    window.addEventListener('scroll', handler, { passive: true });
    return () => {
      window.removeEventListener('scroll', handler);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="home-dc" style={{ animation: 'fadeUp .35s ease' }}>

      {/* ── HERO ── */}
      <section className="home-dc-hero home-dc-fit" style={{ maxWidth: 1440, margin: '0 auto', padding: '38px 48px 74px' }}>

        {/* eyebrow */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontFamily: MONO, fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--mut)', marginBottom: 24 }}>
          <span>SALX / SAOLA CARBON MARKETPLACE</span>
          <span style={{ color: 'var(--org)' }}>EDITION 001 — 2026</span>
        </div>

        {/* hero art */}
        <div ref={heroBoxRef} style={{
          position: 'relative', aspectRatio: '2.2/1', overflow: 'hidden',
          background: 'var(--bg)', display: 'grid', placeItems: 'center',
          marginBottom: 44, transformOrigin: 'top center', willChange: 'transform',
        }}>
          <img
            src="/assets/mayden-1600.webp"
            srcSet="/assets/mayden-1600.webp 1600w, /assets/mayden-3072.webp 3072w"
            sizes="100vw"
            alt="" aria-hidden="true" fetchPriority="high" decoding="async"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', pointerEvents: 'none' }}
          />
          <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', userSelect: 'none' }}>
            <span style={{ fontFamily: SYNE, fontWeight: 800, fontSize: 'clamp(80px,12vw,155px)', lineHeight: 1, letterSpacing: '-.03em', color: '#ede7dc', textShadow: '0 2px 48px rgba(0,0,0,.7)', display: 'inline-flex', gap: 0 }}>
              <span ref={heroSRef} style={{ display: 'inline-block', willChange: 'transform, opacity' }}>S</span>
              <span ref={heroAlRef} style={{ display: 'inline-block', willChange: 'transform, opacity' }}>AL</span>
            </span>
          </div>
        </div>

        {/* copy row */}
        <div className="home-dc-grid-copy" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.08fr) minmax(260px,.72fr)', gap: 70, alignItems: 'end' }}>
          {/* 12cqi = 12% of the hero's content width, so the widest word ("CULTURE", ~8em)
              still fits on phones. It only wins below ~470px; wider screens keep the clamp. */}
          <h1 style={{ fontFamily: SYNE, fontWeight: 800, fontSize: 'min(clamp(52px,7vw,84px),12cqi)', lineHeight: .88, letterSpacing: '-.02em', margin: 0, color: 'var(--g)', textShadow: 'var(--hero-glow)' }}>
            THE CARBON<br />CULTURE IS<br />ON-CHAIN.
          </h1>
          <div>
            <p style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--mut)', margin: '0 0 18px' }}>
              SAL is the native unit for carbon with provenance — a collectible record of real-world restoration, held with complete transparency.
            </p>
            <button
              className="home-dc-btn"
              onClick={() => navigate('/marketplace')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'var(--org)', color: '#1a0d05', border: 'none', fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', fontWeight: 700, padding: '11px 15px', cursor: 'pointer' }}
            >
              EXPLORE SAL ↗
            </button>
          </div>
        </div>
      </section>

      {/* ── 01 / THE SAL UNIT ── */}
      <Reveal>
        <section className="home-dc-section" style={{ padding: '74px 34px 78px', borderTop: '1px solid var(--bd)' }}>
          <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--mut)' }}>
            01 / THE SAL UNIT
          </span>
          <div className="home-dc-grid-2col" style={{ display: 'grid', gridTemplateColumns: '1.05fr .95fr', gap: 86, marginTop: 28, alignItems: 'start' }}>
            <h2 style={{ fontFamily: SYNE, fontWeight: 800, fontSize: 'clamp(40px,5vw,66px)', lineHeight: .91, letterSpacing: '-.02em', margin: 0, color: 'var(--ink)' }}>
              ONE TOKEN.<br />ONE TONNE.<br /><span style={{ color: 'var(--g)' }}>ONE TRACE.</span>
            </h2>
            <div>
              <p style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--mut)', margin: '0 0 44px' }}>
                Each SAL represents one verified tonne of avoided or removed carbon. Project evidence, retirement history, and ownership travel with the unit.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 18, borderTop: '1px solid var(--bd-soft)', paddingTop: 15 }}>
                <MetaItem label="TOKEN" value="SAL" />
                <MetaItem label="PROVENANCE" value="VERIFIED / PUBLIC" valueColor="var(--org)" />
                <MetaItem label="SETTLEMENT" value="AVALANCHE FUJI" />
              </div>
            </div>
          </div>
        </section>
      </Reveal>

      {/* ── 02 / SELECTED EDITIONS ── */}
      <Reveal delay={80}>
        <section className="home-dc-section" style={{ padding: '64px 34px 90px', borderTop: '1px solid var(--bd)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 24 }}>
            <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--mut)' }}>
              02 SELECTED EDITIONS
            </span>
            <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--mut)' }}>
              ← DRAG →
            </span>
          </div>
          <div className="home-dc-scroller" style={{ display: 'flex', gap: 18, overflowX: 'auto', scrollSnapType: 'x mandatory', paddingBottom: 14, scrollbarWidth: 'none' }}>
            {editions.status === 'loading' && Array.from({ length: 3 }, (_, i) => (
              <div key={i} aria-hidden="true" style={EDITION_CARD_STYLE}>
                <div className="market-dc-skeleton-line" style={{ height: 'auto', aspectRatio: '1.18/1', borderRadius: 12 }} />
                <div className="market-dc-skeleton-line" style={{ width: '70%', marginTop: 14 }} />
                <div className="market-dc-skeleton-line" style={{ width: '45%', marginTop: 8 }} />
              </div>
            ))}
            {editions.editions.map(ed => (
              <article
                key={ed.id}
                className="home-dc-card"
                style={{ ...EDITION_CARD_STYLE, cursor: 'pointer' }}
              >
                <div style={{ position: 'relative', aspectRatio: '1.18/1', background: ed.artBg, overflow: 'hidden', borderRadius: 12 }}>
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,transparent 34%,rgba(5,6,5,.88) 100%)' }} />
                  <span style={{ position: 'absolute', left: 10, top: 10, zIndex: 2, fontFamily: MONO, fontSize: 8, letterSpacing: '.04em', textTransform: 'uppercase', fontWeight: 500, padding: '5px 8px', borderRadius: 999, background: ed.badgeBg, color: ed.badgeColor }}>
                    {ed.badge}
                  </span>
                  <span style={{ position: 'absolute', right: 10, top: 10, zIndex: 2, fontFamily: MONO, fontSize: 8, padding: '5px 8px', borderRadius: 999, color: 'var(--ink)', background: 'rgba(5,6,5,.55)', border: '1px solid var(--bd-str)' }}>
                    {ed.id}
                  </span>
                </div>
                <h3 style={{ fontFamily: SYNE, fontSize: 15, letterSpacing: '-.01em', margin: '12px 0 4px', color: 'var(--ink)', fontWeight: 700 }}>
                  {ed.title}
                </h3>
                <p style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.08em', color: 'var(--mut)', margin: '0 0 9px' }}>
                  {ed.meta}
                </p>
                <strong style={{ fontFamily: MONO, fontSize: 11, fontWeight: 500, color: 'var(--g)' }}>
                  {ed.price}
                </strong>
                <button
                  className="home-dc-btn"
                  onClick={() => navigate('/marketplace')}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: MONO, fontSize: 8, letterSpacing: '.12em', textTransform: 'uppercase', marginTop: 11, background: 'none', border: 'none', color: 'var(--mut)', cursor: 'pointer', padding: 0 }}
                >
                  COLLECT SAL ↗
                </button>
              </article>
            ))}
            {/* Closing card: invites new projects, or explains an empty or failed load. */}
            {editions.status !== 'loading' && (
              <article className="home-dc-card" style={EDITION_CARD_STYLE}>
                <div style={{ aspectRatio: '1.18/1', borderRadius: 12, border: '1px dashed var(--bd-str)', display: 'grid', placeItems: 'center', padding: 20, textAlign: 'center' }}>
                  <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--mut)' }}>
                    {editions.status === 'error' ? 'EDITIONS COULD NOT LOAD' : editions.editions.length === 0 ? 'NO EDITIONS ON SALE YET' : 'YOUR PROJECT HERE'}
                  </span>
                </div>
                <h3 style={{ fontFamily: SYNE, fontSize: 15, letterSpacing: '-.01em', margin: '12px 0 4px', color: 'var(--ink)', fontWeight: 700 }}>
                  {editions.status === 'error' ? 'Browse the marketplace' : 'List your carbon project'}
                </h3>
                <p style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.08em', color: 'var(--mut)', margin: '0 0 9px' }}>
                  {editions.status === 'error' ? 'The server may be starting. Try the marketplace.' : 'Submit MRV evidence for validator approval.'}
                </p>
                <button
                  className="home-dc-btn"
                  onClick={() => navigate(editions.status === 'error' ? '/marketplace' : '/submit')}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: MONO, fontSize: 8, letterSpacing: '.12em', textTransform: 'uppercase', marginTop: 11, background: 'none', border: 'none', color: 'var(--mut)', cursor: 'pointer', padding: 0 }}
                >
                  {editions.status === 'error' ? 'OPEN MARKETPLACE ↗' : 'SUBMIT A PROJECT ↗'}
                </button>
              </article>
            )}
          </div>
        </section>
      </Reveal>

      {/* ── 03 / THE FINAL CUT ── */}
      <Reveal>
        <section className="home-dc-section home-dc-fit" style={{ padding: '80px 34px 100px', borderTop: '1px solid var(--bd)' }}>
          <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--mut)' }}>
            03 / THE FINAL CUT
          </span>
          <div className="home-dc-grid-2col" style={{ display: 'grid', gridTemplateColumns: '1.05fr .95fr', gap: 86, marginTop: 28, alignItems: 'end' }}>
            {/* "PERMANENT." is ~11.1em wide; 8.8cqi keeps it inside the section on phones (<~515px). */}
            <h2 style={{ fontFamily: SYNE, fontWeight: 800, fontSize: 'min(clamp(42px,5.2vw,68px),8.8cqi)', lineHeight: .91, letterSpacing: '-.02em', margin: 0, color: 'var(--ink)' }}>
              MAKE THE<br /><span style={{ color: 'var(--g)' }}>IMPACT PERMANENT.</span>
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <p style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--mut)', margin: 0, maxWidth: 340 }}>
                Retire SAL and receive a record that proves exactly what your organisation funded — from project to certificate.
              </p>
              <button
                className="home-dc-btn"
                onClick={() => navigate('/retire')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'var(--org)', border: 'none', color: '#1a0d05', fontFamily: MONO, fontSize: 8, letterSpacing: '.12em', textTransform: 'uppercase', fontWeight: 700, padding: '12px 16px', marginTop: 20, cursor: 'pointer' }}
              >
                RETIRE SAL ↗
              </button>
            </div>
          </div>
        </section>
      </Reveal>

      {/* ── 04 / CONTACT ── */}
      <Reveal>
        <section className="home-dc-section" style={{ padding: '80px 34px 90px', borderTop: '1px solid var(--bd)' }}>
          <div className="home-dc-grid-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 80, alignItems: 'end' }}>
            <div>
              <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--mut)' }}>
                04 / CONTACT
              </span>
              <h2 style={{ fontFamily: SYNE, fontWeight: 800, fontSize: 'clamp(40px,5vw,64px)', lineHeight: .91, letterSpacing: '-.02em', margin: '12px 0 16px', color: 'var(--ink)' }}>
                GET IN<br />TOUCH.
              </h2>
              <p style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--mut)', maxWidth: 380 }}>
                For project listings, validator applications, or partnership enquiries — reach out directly.
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { label: 'hello@salx.io', href: 'mailto:hello@salx.io' },
                { label: '@salxprotocol', href: '#' },
                { label: 'Discord Community', href: '#' },
              ].map(link => (
                <a
                  key={link.label}
                  href={link.href}
                  className="home-dc-link"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', border: '1px solid var(--bd-mid)', borderRadius: 10, color: 'var(--ink)', textDecoration: 'none' }}
                >
                  <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '.04em' }}>{link.label}</span>
                  <span style={{ fontSize: 16, color: 'var(--g)' }}>↗</span>
                </a>
              ))}
            </div>
          </div>
        </section>
      </Reveal>

      {/* page footer */}
      <div style={{ borderTop: '1px solid var(--bd-soft)', fontFamily: MONO, fontSize: 7, letterSpacing: '.13em', textTransform: 'uppercase', padding: '20px 34px 28px', textAlign: 'center', color: 'var(--faint)' }}>
        © 2026 SALX | SAOLA CARBON MARKETPLACE. POWERED BY AVALANCHE.
      </div>

    </div>
  );
}
