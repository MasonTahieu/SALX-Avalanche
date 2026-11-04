import type { Listing, Project } from '../../types/domain';
import { projectDisplay } from '../../lib/projectMeta';
import { useBuyListing } from './useBuyListing';
import { env } from '../../config/env';

const MONO = "'IBM Plex Mono', 'JetBrains Mono', monospace";
const SYNE = "'Syne', sans-serif";

interface CertBadge { label: string; bg: string; color: string }

function certBadge(methodology: string): CertBadge {
  return methodology.toLowerCase().includes('gold')
    ? { label: 'GOLD STANDARD', bg: '#e7c765', color: '#3a2c05' }
    : { label: 'VCS VERIFIED', bg: '#2dc922', color: '#08150e' };
}

export interface MarketDcCardProps {
  listing: Listing;
  project?: Project;
  onChanged: () => void;
}

export function MarketDcCard({ listing, project, onChanged }: MarketDcCardProps) {
  const { buy, busy, message, amount, setAmount } = useBuyListing(listing, onChanged);

  const details = projectDisplay(project);
  const badge = certBadge(details.methodology);
  // Procedural cover: shift radial accent by project ID so cards look distinct
  const gx = 30 + (listing.projectId * 23) % 50;
  const gy = 10 + (listing.projectId * 37) % 50;
  const metaText = [details.projectType, details.location].filter(Boolean).join(' · ');
  const isBlacklisted = project?.blacklisted ?? false;
  const disabled = busy || isBlacklisted;
  const canChooseQty = listing.remainingAmount > 1;
  const totalEth = (parseFloat(listing.pricePerUnitETH) * amount).toPrecision(4);

  const mrvDocs: Array<{ name?: string; uri?: string }> =
    (project?.projectMetadata as any)?.properties?.documents ?? [];
  const firstMrvUri = mrvDocs[0]?.uri ?? null;
  const mrvHref = firstMrvUri?.startsWith('ipfs://')
    ? `https://gateway.pinata.cloud/ipfs/${firstMrvUri.slice(7)}`
    : firstMrvUri ?? null;
  const mrvLabel = mrvDocs.length > 1 ? `IPFS MRV (${mrvDocs.length}) ↗` : 'IPFS MRV ↗';

  const buyLabel = isBlacklisted ? 'BLACKLISTED' : busy ? 'BUYING…' : `BUY ${amount} SAL ↗`;

  return (
    <article
      className="market-dc-card"
      style={{ background: 'var(--surf)', border: '1px solid var(--bd)', borderRadius: 12, padding: 10, transition: 'transform .18s ease,border-color .18s ease' }}
    >
      {/* Cover — procedural placeholder, no IPFS image */}
      <div style={{ position: 'relative', aspectRatio: '1.16 / 1', overflow: 'hidden', borderRadius: 8 }}>
        <div style={{ display: 'flex', height: '100%', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: `radial-gradient(circle at ${gx}% ${gy}%,rgba(45,201,34,.32),transparent 55%),linear-gradient(135deg,#031a13,#0a3d31)`, color: '#caffec' }}>
          <span style={{ fontFamily: SYNE, fontWeight: 800, fontSize: 22, letterSpacing: '.14em' }}>SALX</span>
          <small style={{ fontFamily: MONO, fontSize: 7, marginTop: 5, opacity: .45, letterSpacing: '.12em' }}>
            PROJECT #{listing.projectId}
          </small>
        </div>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,transparent 45%,rgba(5,6,5,.82) 100%)', pointerEvents: 'none' }} />
        <span style={{ position: 'absolute', left: 8, top: 8, zIndex: 2, fontFamily: MONO, fontSize: 8, letterSpacing: '.04em', textTransform: 'uppercase', fontWeight: 500, padding: '4px 7px', borderRadius: 999, background: badge.bg, color: badge.color }}>
          {badge.label}
        </span>
        <span style={{ position: 'absolute', right: 8, top: 8, zIndex: 2, fontFamily: MONO, fontSize: 8, padding: '4px 7px', borderRadius: 999, color: 'var(--ink)', background: 'rgba(5,6,5,.55)', border: '1px solid var(--bd)' }}>
          #{listing.projectId}
        </span>
      </div>

      {/* Body */}
      <div style={{ paddingTop: 10 }}>
        <h2 style={{ fontFamily: MONO, fontSize: 13, lineHeight: 1.2, letterSpacing: '-.01em', margin: '0 0 4px', color: 'var(--ink)', fontWeight: 700 }}>
          {project?.projectName || `SAL Project #${listing.projectId}`}
        </h2>
        {metaText && (
          <span style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mut)' }}>{metaText}</span>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 10 }}>
          <div>
            <span style={{ display: 'block', fontFamily: MONO, fontSize: 7, color: 'var(--faint)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 3 }}>UNIT PRICE</span>
            <strong style={{ fontFamily: MONO, fontSize: 9, fontWeight: 500, color: 'var(--g)' }}>
              {listing.pricePerUnitETH} {env.nativeSymbol}/SAL
            </strong>
          </div>
          {mrvHref && (
            <a
              href={mrvHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{ fontFamily: MONO, fontSize: 7, color: 'var(--mut)', textDecoration: 'none' }}
            >
              {mrvLabel}
            </a>
          )}
        </div>

        {/* Quantity selector — only shown when more than 1 unit is available */}
        {canChooseQty && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 10 }}>
            <span style={{ fontFamily: MONO, fontSize: 7, color: 'var(--faint)', letterSpacing: '.1em', textTransform: 'uppercase', marginRight: 2 }}>QTY</span>
            <button
              type="button"
              onClick={() => setAmount(amount - 1)}
              disabled={disabled || amount <= 1}
              style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, width: 22, height: 22, borderRadius: 4, border: '1px solid var(--bd)', background: 'var(--surf2)', color: 'var(--ink)', cursor: !disabled && amount > 1 ? 'pointer' : 'not-allowed', opacity: !disabled && amount > 1 ? 1 : 0.35, flexShrink: 0 }}
            >−</button>
            <input
              type="number"
              value={amount}
              min={1}
              max={listing.remainingAmount}
              onChange={e => setAmount(Math.max(1, Math.round(Number(e.target.value))))}
              disabled={disabled}
              style={{ fontFamily: MONO, fontSize: 8, width: 38, textAlign: 'center', background: 'var(--surf2)', border: '1px solid var(--bd)', borderRadius: 4, color: 'var(--ink)', padding: '3px 4px' }}
            />
            <button
              type="button"
              onClick={() => setAmount(amount + 1)}
              disabled={disabled || amount >= listing.remainingAmount}
              style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, width: 22, height: 22, borderRadius: 4, border: '1px solid var(--bd)', background: 'var(--surf2)', color: 'var(--ink)', cursor: !disabled && amount < listing.remainingAmount ? 'pointer' : 'not-allowed', opacity: !disabled && amount < listing.remainingAmount ? 1 : 0.35, flexShrink: 0 }}
            >+</button>
            <span style={{ fontFamily: MONO, fontSize: 7, color: 'var(--mut)', marginLeft: 'auto' }}>
              = {totalEth} {env.nativeSymbol}
            </span>
          </div>
        )}

        <button
          onClick={buy}
          disabled={disabled}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            background: disabled ? 'rgba(45,201,34,.25)' : 'var(--g)',
            border: '1px solid var(--g)', borderRadius: 6, padding: 9,
            fontFamily: MONO, fontSize: 8, letterSpacing: '.11em', textTransform: 'uppercase',
            fontWeight: 700, color: '#08150e', width: '100%', marginTop: 10,
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? .6 : 1,
            transition: 'opacity .15s,background .15s',
          }}
        >
          {buyLabel}
        </button>

        {message && (
          <div style={{ marginTop: 6, fontFamily: MONO, fontSize: 8, color: 'var(--mut)', wordBreak: 'break-all' }}>
            {message}
          </div>
        )}
      </div>
    </article>
  );
}
