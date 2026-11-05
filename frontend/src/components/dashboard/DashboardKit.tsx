import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react';
import type { Certificate } from '../../types/domain';

// Shared building blocks for the dashboard tabs (Portfolio, Certificates) so both
// speak the same visual language: mono labels, Syne headings, --surf panels.
export const MONO = "'JetBrains Mono', monospace";
export const SYNE = "'Syne', sans-serif";

export function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add('is-visible'); obs.disconnect(); } },
      { threshold: 0.08 },
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

export function StatGrid({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 14, marginBottom: 28 }}>
      {children}
    </div>
  );
}

export function StatCard({ label, value, unit, sub, accent, action, onAction, actionColor = 'var(--org)' }: {
  label: string; value: string | number; unit?: string; sub?: string; accent?: boolean;
  action?: string; onAction?: () => void; actionColor?: string;
}) {
  return (
    <div style={{ background: 'var(--surf)', border: '1px solid var(--bd-mid)', borderRadius: 10, padding: 16 }}>
      <span style={{ display: 'block', fontFamily: MONO, fontSize: 7, letterSpacing: '.13em', textTransform: 'uppercase', color: 'var(--mut)', marginBottom: 10 }}>{label}</span>
      <div>
        <strong style={{ fontSize: 22, fontWeight: 700, color: accent ? 'var(--g)' : 'var(--ink)', letterSpacing: '-.02em' }}>{value}</strong>
        {unit && <span style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mut)', marginLeft: 6 }}>{unit}</span>}
      </div>
      {sub && <div style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mut)', marginTop: 4 }}>{sub}</div>}
      {action && onAction && (
        <button
          onClick={onAction}
          style={{ display: 'block', marginTop: 8, fontFamily: MONO, fontSize: 7, letterSpacing: '.08em', textTransform: 'uppercase', background: actionColor, color: '#fff', border: 'none', borderRadius: 4, padding: '4px 8px', cursor: 'pointer' }}
        >
          {action}
        </button>
      )}
    </div>
  );
}

export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
      <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--mut)' }}>{children}</span>
      {right}
    </div>
  );
}

export function SectionLink({ href, onClick, children }: { href: string; onClick?: (event: MouseEvent<HTMLAnchorElement>) => void; children: ReactNode }) {
  return (
    <a href={href} onClick={onClick} style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--g)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
      {children}
    </a>
  );
}

// Centered mono line used for loading and empty states inside a section.
export function MonoNotice({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mut)', padding: '28px 16px', textAlign: 'center', letterSpacing: '.08em', lineHeight: 1.7 }}>
      {children}
    </div>
  );
}

const STATUS_STYLES: Record<Certificate['status'], { c: string; bg: string; border: string }> = {
  ACTIVE:  { c: 'var(--g)',    bg: 'rgba(45,201,34,.1)',    border: 'rgba(45,201,34,.27)' },
  REVOKED: { c: '#e05252',     bg: 'rgba(224,82,82,.1)',    border: 'rgba(224,82,82,.27)' },
  PENDING: { c: 'var(--gold)', bg: 'rgba(231,199,101,.12)', border: 'rgba(231,199,101,.27)' },
  EXPIRED: { c: 'var(--mut)',  bg: 'rgba(158,165,168,.1)',  border: 'rgba(158,165,168,.2)' },
};

export function CertBadge({ status }: { status: Certificate['status'] }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.PENDING;
  return (
    <span style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.1em', padding: '3px 8px', borderRadius: 4, background: s.bg, color: s.c, border: `1px solid ${s.border}` }}>{status}</span>
  );
}

const TX_COLORS: Record<string, { bg: string; color: string }> = {
  PURCHASE:  { bg: 'rgba(45,201,34,.12)',   color: 'var(--g)' },
  SALE:      { bg: 'rgba(231,199,101,.12)', color: 'var(--gold)' },
  RETIRE:    { bg: 'rgba(232,145,60,.12)',  color: 'var(--org)' },
  LISTING:   { bg: 'rgba(158,165,168,.1)',  color: 'var(--mut)' },
  MINT:      { bg: 'rgba(45,201,34,.08)',   color: 'var(--g)' },
};

export function txStyle(type?: string) {
  return TX_COLORS[type?.toUpperCase() ?? ''] ?? { bg: 'rgba(158,165,168,.1)', color: 'var(--mut)' };
}

export function TxTypePill({ type }: { type?: string }) {
  const s = txStyle(type);
  return (
    <span style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.1em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: 4, background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>
      {type || 'EVENT'}
    </span>
  );
}
