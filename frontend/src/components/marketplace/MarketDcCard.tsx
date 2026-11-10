import { useState, type CSSProperties } from 'react';
import type { Listing, Project } from '../../types/domain';
import { ipfsToHttp, projectDisplay } from '../../lib/projectMeta';
import { env } from '../../config/env';
import { certBadge } from './certBadge';
import { LazyDocumentViewer, openInPlace, toViewerDocuments } from '../documents/LazyDocumentViewer';

const MONO = "'IBM Plex Mono', 'JetBrains Mono', monospace";
const SYNE = "'Syne', sans-serif";

const clampLines = (lines: number): CSSProperties => ({
  display: '-webkit-box',
  WebkitLineClamp: lines,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
});

export interface MarketDcCardProps {
  listing: Listing;
  project?: Project;
  /** Opens the checkout for this listing with the chosen quantity. */
  onCheckout: (amount: number) => void;
}

export function MarketDcCard({ listing, project, onCheckout }: MarketDcCardProps) {
  const [quantity, setQuantity] = useState(1);
  // A refresh can lower what is left, so the chosen quantity is capped when used.
  const amount = Math.max(1, Math.min(listing.remainingAmount, quantity));
  const setAmount = (value: number) => setQuantity(Math.max(1, Math.min(listing.remainingAmount, value)));
  const [docsOpen, setDocsOpen] = useState(false);

  const projectName = project?.projectName || `SAL Project #${listing.projectId}`;
  const details = projectDisplay(project);
  const badge = certBadge(details.methodology);
  // Procedural cover: shift radial accent by project ID so cards look distinct
  const gx = 30 + (listing.projectId * 23) % 50;
  const gy = 10 + (listing.projectId * 37) % 50;
  const metaText = [details.projectType, details.location].filter(Boolean).join(' · ');
  const isBlacklisted = project?.blacklisted ?? false;
  const disabled = isBlacklisted;
  const canChooseQty = listing.remainingAmount > 1;
  const totalEth = (parseFloat(listing.pricePerUnitETH) * amount).toPrecision(4);

  const mrvDocs = toViewerDocuments((project?.projectMetadata as any)?.properties?.documents);
  // A click previews the MRV documents in place; the href (first document on
  // the IPFS gateway) still serves Ctrl/middle click and "open in new tab".
  const firstMrv = mrvDocs[0];
  const mrvHref = firstMrv ? ipfsToHttp(firstMrv.uri, firstMrv.name) : null;
  const mrvLabel = mrvDocs.length > 1 ? `IPFS MRV (${mrvDocs.length})` : 'IPFS MRV';

  const buyLabel = isBlacklisted ? 'BLACKLISTED' : 'BUY & GET CERTIFICATE';

  return (
    <article
      className="market-dc-card"
      style={{ display: 'flex', flexDirection: 'column', background: 'var(--surf)', border: '1px solid var(--bd)', borderRadius: 12, padding: 10, transition: 'transform .18s ease,border-color .18s ease' }}
    >
      {/* Cover — procedural placeholder, no IPFS image */}
      <div style={{ position: 'relative', aspectRatio: '1.16 / 1', overflow: 'hidden', borderRadius: 8 }}>
        <div style={{ display: 'flex', height: '100%', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: `radial-gradient(circle at ${gx}% ${gy}%,rgba(45,201,34,.32),transparent 55%),linear-gradient(135deg,#031a13,#0a3d31)`, color: '#caffec' }}>
          <span style={{ fontFamily: SYNE, fontWeight: 800, fontSize: 22, letterSpacing: '.14em' }}>SALX</span>
          <small style={{ fontFamily: MONO, fontSize: 9, marginTop: 5, opacity: .6, letterSpacing: '.12em' }}>
            PROJECT #{listing.projectId}
          </small>
        </div>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,transparent 45%,rgba(5,6,5,.82) 100%)', pointerEvents: 'none' }} />
        <span style={{ position: 'absolute', left: 8, top: 8, zIndex: 2, fontFamily: MONO, fontSize: 10, letterSpacing: '.04em', textTransform: 'uppercase', fontWeight: 500, padding: '4px 7px', borderRadius: 999, background: badge.bg, color: badge.color }}>
          {badge.label}
        </span>
        <span style={{ position: 'absolute', right: 8, top: 8, zIndex: 2, fontFamily: MONO, fontSize: 10, padding: '4px 7px', borderRadius: 999, color: '#ede7dc', background: 'rgba(5,6,5,.55)', border: '1px solid rgba(237,231,220,.22)' }}>
          #{listing.projectId}
        </span>
      </div>

      {/* Body: the name and location keep a fixed height and the buying rows sit
          at the bottom, so every row lines up across the cards in a grid row. */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, paddingTop: 10 }}>
        <h2 title={projectName} style={{ ...clampLines(2), minHeight: '2.4em', fontFamily: MONO, fontSize: 14, lineHeight: 1.2, letterSpacing: '-.01em', margin: '0 0 4px', color: 'var(--ink)', fontWeight: 700 }}>
          {projectName}
        </h2>
        <div title={metaText || undefined} style={{ ...clampLines(2), minHeight: '2.8em', fontFamily: MONO, fontSize: 11, lineHeight: 1.4, color: 'var(--mut)' }}>
          {metaText}
        </div>

        <div style={{ marginTop: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 10 }}>
            <div style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontFamily: MONO, fontSize: 10, color: 'var(--mut)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 3 }}>UNIT PRICE</span>
              <strong style={{ display: 'block', fontFamily: MONO, fontSize: 13, lineHeight: 1.3, fontWeight: 500, color: 'var(--g-text)', overflowWrap: 'anywhere' }}>
                {listing.pricePerUnitETH} {env.nativeSymbol}/SAL
              </strong>
            </div>
            {mrvHref && (
              <a
                href={mrvHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => openInPlace(e, () => setDocsOpen(true))}
                aria-haspopup="dialog"
                title="Preview the MRV documents stored on IPFS"
                // Padding with matching negative margin: a finger-sized tap area
                // without changing the row's layout.
                style={{ fontFamily: MONO, fontSize: 11, lineHeight: 1.3, color: 'var(--mut)', textDecoration: 'none', whiteSpace: 'nowrap', padding: '10px 0 10px 12px', margin: '-10px 0' }}
              >
                {mrvLabel}
              </a>
            )}
          </div>

          {/* Always shown so the rows stay aligned; a single remaining unit locks it at 1. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 10 }}>
            <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mut)', letterSpacing: '.1em', textTransform: 'uppercase', marginRight: 2 }}>QTY</span>
            <button
              type="button"
              aria-label="Decrease quantity"
              onClick={() => setAmount(amount - 1)}
              disabled={disabled || amount <= 1}
              style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, width: 24, height: 24, borderRadius: 4, border: '1px solid var(--bd)', background: 'var(--surf2)', color: 'var(--ink)', cursor: !disabled && amount > 1 ? 'pointer' : 'not-allowed', opacity: !disabled && amount > 1 ? 1 : 0.35, flexShrink: 0 }}
            >−</button>
            <input
              type="number"
              aria-label="Quantity"
              value={amount}
              min={1}
              max={listing.remainingAmount}
              onChange={e => setAmount(Math.max(1, Math.round(Number(e.target.value))))}
              disabled={disabled || !canChooseQty}
              style={{ fontFamily: MONO, fontSize: 12, width: 44, textAlign: 'center', background: 'var(--surf2)', border: '1px solid var(--bd)', borderRadius: 4, color: 'var(--ink)', padding: '3px 4px' }}
            />
            <button
              type="button"
              aria-label="Increase quantity"
              onClick={() => setAmount(amount + 1)}
              disabled={disabled || amount >= listing.remainingAmount}
              style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, width: 24, height: 24, borderRadius: 4, border: '1px solid var(--bd)', background: 'var(--surf2)', color: 'var(--ink)', cursor: !disabled && amount < listing.remainingAmount ? 'pointer' : 'not-allowed', opacity: !disabled && amount < listing.remainingAmount ? 1 : 0.35, flexShrink: 0 }}
            >+</button>
            <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mut)', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
              = {totalEth} {env.nativeSymbol}
            </span>
          </div>

          <button
            type="button"
            onClick={() => onCheckout(amount)}
            disabled={disabled}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              background: disabled ? 'rgba(45,201,34,.25)' : 'var(--g)',
              border: '1px solid var(--g)', borderRadius: 6, padding: 10,
              fontFamily: MONO, fontSize: 11, letterSpacing: '.11em', textTransform: 'uppercase',
              fontWeight: 700, color: '#08150e', width: '100%', marginTop: 10,
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? .6 : 1,
              transition: 'opacity .15s,background .15s',
            }}
          >
            {buyLabel}
          </button>
        </div>
      </div>

      {docsOpen && (
        <LazyDocumentViewer
          documents={mrvDocs}
          title={projectName}
          onClose={() => setDocsOpen(false)}
        />
      )}
    </article>
  );
}
