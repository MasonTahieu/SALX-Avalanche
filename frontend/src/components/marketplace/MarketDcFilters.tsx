import type { DcFilterState } from './useMarketFilters';
import { VINTAGE_MIN, VINTAGE_MAX } from './useMarketFilters';

const MONO = "'JetBrains Mono', monospace";

const SELECT_STYLE: React.CSSProperties = {
  width: '100%',
  background: 'var(--surf2)',
  border: '1px solid var(--bd)',
  borderRadius: 6,
  padding: '7px 28px 7px 10px',
  minHeight: 34,
  outline: 'none',
  color: 'var(--ink)',
  fontSize: 12,
  fontFamily: MONO,
  appearance: 'none',
  textOverflow: 'ellipsis',
};

function FilterLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.13em', textTransform: 'uppercase' as const, color: 'var(--mut)' }}>
      {children}
    </span>
  );
}

function SelectWrap({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: 'relative', marginTop: 6 }}>
      {children}
      <span aria-hidden="true" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--mut)', fontSize: 11 }}>▾</span>
    </div>
  );
}

export interface MarketDcFiltersProps {
  types: string[];
  geos: string[];
  pending: DcFilterState;
  onType: (v: string) => void;
  onGeo: (v: string) => void;
  onVintage: (v: number) => void;
  onApply: () => void;
  onClear: () => void;
}

export function MarketDcFilters({ types, geos, pending, onType, onGeo, onVintage, onApply, onClear }: MarketDcFiltersProps) {
  const vintageLabel = pending.vintage === VINTAGE_MIN ? 'ALL' : String(pending.vintage);

  return (
    <section style={{ background: 'var(--surf)', border: '1px solid var(--bd)', borderRadius: 12, padding: '18px 16px', position: 'sticky', top: 80, display: 'flex', flexDirection: 'column', minHeight: 370 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--ink)' }}>FILTERS</span>
        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.08em', color: 'var(--mut)' }}>REFINE</span>
      </div>

      <label style={{ display: 'flex', flexDirection: 'column', marginBottom: 13 }}>
        <FilterLabel>PROJECT TYPE</FilterLabel>
        <SelectWrap>
          <select value={pending.projectType} onChange={(e) => onType(e.target.value)} style={SELECT_STYLE}>
            <option value="">All</option>
            {types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </SelectWrap>
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', marginBottom: 13 }}>
        <FilterLabel>GEOGRAPHY</FilterLabel>
        <SelectWrap>
          <select value={pending.geography} onChange={(e) => onGeo(e.target.value)} style={SELECT_STYLE}>
            <option value="">All</option>
            {geos.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </SelectWrap>
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', marginBottom: 16 }}>
        <FilterLabel>VINTAGE ({vintageLabel})</FilterLabel>
        <div style={{ paddingTop: 10 }}>
          <input
            type="range"
            min={VINTAGE_MIN}
            max={VINTAGE_MAX}
            step={1}
            value={pending.vintage}
            onChange={(e) => onVintage(Number(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--g)' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontFamily: MONO, fontSize: 10, color: 'var(--mut)' }}>
            <span>{VINTAGE_MIN}</span>
            <span>{VINTAGE_MAX}</span>
          </div>
        </div>
      </label>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 'auto' }}>
        <button
          onClick={onApply}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'var(--g)', border: '1px solid var(--g)', borderRadius: 6, padding: 10, fontFamily: MONO, fontSize: 11, letterSpacing: '.11em', textTransform: 'uppercase', fontWeight: 700, color: '#08150e', width: '100%', cursor: 'pointer' }}
        >
          APPLY FILTERS ↗
        </button>
        <button
          onClick={onClear}
          style={{ background: 'transparent', border: 'none', color: 'var(--mut)', fontFamily: MONO, fontSize: 11, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3, padding: '6px 0' }}
        >
          CLEAR ALL
        </button>
      </div>
    </section>
  );
}
