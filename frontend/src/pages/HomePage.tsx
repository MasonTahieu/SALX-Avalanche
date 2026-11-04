import { useEffect, useRef, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { env } from '../config/env';

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

const EDITIONS: EditionCard[] = [
  {
    id: 'SAL-0001',
    title: 'Cần Giờ Mangrove Forest',
    meta: 'ID: 1 | Ho Chi Minh City',
    price: `0.020 ${env.nativeSymbol}/SAL`,
    badge: 'VCS VERIFIED',
    badgeBg: '#2dc922',
    badgeColor: '#08150e',
    artBg: 'linear-gradient(155deg,#0a1c13 0%,#162a1c 100%)',
  },
  {
    id: 'SAL-0002',
    title: 'Bạc Liêu Wind Power',
    meta: 'ID: 2 | Bạc Liêu, Vietnam',
    price: `0.015 ${env.nativeSymbol}/SAL`,
    badge: 'VCS VERIFIED',
    badgeBg: '#2dc922',
    badgeColor: '#08150e',
    artBg: 'linear-gradient(155deg,#0c1e22 0%,#0e2830 100%)',
  },
  {
    id: 'SAL-0003',
    title: 'Bình Dương Rooftop Solar',
    meta: 'ID: 3 | Bình Dương',
    price: `0.010 ${env.nativeSymbol}/SAL`,
    badge: 'GOLD STANDARD',
    badgeBg: '#e7c765',
    badgeColor: '#3a2c05',
    artBg: 'linear-gradient(155deg,#1e1c0a 0%,#28260e 100%)',
  },
];

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
  const heroBoxRef = useRef<HTMLDivElement>(null);
  const heroSRef = useRef<HTMLSpanElement>(null);
  const heroAlRef = useRef<HTMLSpanElement>(null);

  // Split "SAL" → "S" drifts left, "AL" drifts right on scroll
  useEffect(() => {
    const handler = () => {
      const prog = Math.min(window.scrollY / 280, 1);
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
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  return (
    <div className="home-dc" style={{ animation: 'fadeUp .35s ease' }}>

      {/* ── HERO ── */}
      <section style={{ maxWidth: 1440, margin: '0 auto', padding: '38px 48px 74px' }}>

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
          <img src="/salx-logo.png" alt="" aria-hidden="true" style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', objectPosition: 'center',
            filter: 'contrast(1.08) brightness(1.02)', pointerEvents: 'none', transform: 'translateZ(0)',
          }} />
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'url("/assets/mayden.png") center / cover no-repeat' }} />
          <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', userSelect: 'none' }}>
            <span style={{ fontFamily: SYNE, fontWeight: 800, fontSize: 'clamp(80px,12vw,155px)', lineHeight: 1, letterSpacing: '-.03em', color: '#ede7dc', textShadow: '0 2px 48px rgba(0,0,0,.7)', display: 'inline-flex', gap: 0 }}>
              <span ref={heroSRef} style={{ display: 'inline-block', willChange: 'transform, opacity' }}>S</span>
              <span ref={heroAlRef} style={{ display: 'inline-block', willChange: 'transform, opacity' }}>AL</span>
            </span>
          </div>
        </div>

        {/* copy row */}
        <div className="home-dc-grid-copy" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.08fr) minmax(260px,.72fr)', gap: 70, alignItems: 'end' }}>
          <h1 style={{ fontFamily: SYNE, fontWeight: 800, fontSize: 'clamp(52px,7vw,84px)', lineHeight: .88, letterSpacing: '-.02em', margin: 0, color: 'var(--g)', textShadow: 'var(--hero-glow)' }}>
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
            {EDITIONS.map(ed => (
              <article
                key={ed.id}
                className="home-dc-card"
                style={{ flex: '0 0 calc((100% - 36px)/3)', minWidth: 250, scrollSnapAlign: 'start', cursor: 'pointer' }}
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
          </div>
        </section>
      </Reveal>

      {/* ── 03 / THE FINAL CUT ── */}
      <Reveal>
        <section className="home-dc-section" style={{ padding: '80px 34px 100px', borderTop: '1px solid var(--bd)' }}>
          <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--mut)' }}>
            03 / THE FINAL CUT
          </span>
          <div className="home-dc-grid-2col" style={{ display: 'grid', gridTemplateColumns: '1.05fr .95fr', gap: 86, marginTop: 28, alignItems: 'end' }}>
            <h2 style={{ fontFamily: SYNE, fontWeight: 800, fontSize: 'clamp(42px,5.2vw,68px)', lineHeight: .91, letterSpacing: '-.02em', margin: 0, color: 'var(--ink)' }}>
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
