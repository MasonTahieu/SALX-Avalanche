import { useState } from 'react';
import type { Certificate, Project } from '../../types/domain';
import { formatDate, shortAddress } from '../../lib/format';
import { env } from '../../config/env';
import { certificateImageUrl } from '../../lib/certificateImage';
import { CertificateLightbox } from './CertificateLightbox';

const BODY = 'var(--font-body)';
const MONO = 'var(--font-mono)';
const BD = 'var(--bd-str)';
const BD2 = 'var(--bd-soft)';

type ImageState = 'loading' | 'ready' | 'error';

function DetailRow({ label, value, href, mono }: { label: string; value: string; href?: string; mono?: boolean }) {
  const valueStyle = { fontFamily: mono ? MONO : BODY, fontSize: mono ? 12 : 13, color: href ? 'var(--g)' : 'var(--ink)', textDecoration: 'none', textAlign: 'right' as const, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const };
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, padding: '9px 0', borderTop: `1px solid ${BD2}` }}>
      <span style={{ fontFamily: BODY, fontSize: 12, color: 'var(--mut)', flexShrink: 0 }}>{label}</span>
      {href
        ? <a href={href} target="_blank" rel="noreferrer" style={valueStyle}>{value} ↗</a>
        : <span style={valueStyle}>{value}</span>}
    </div>
  );
}

export function CertificateCard({ certificate, project, eager = false }: { certificate: Certificate; project?: Project; eager?: boolean }) {
  const [imageState, setImageState] = useState<ImageState>('loading');
  const [copied, setCopied] = useState(false);
  const [zoomed, setZoomed] = useState(false);

  const tokenId = certificate.certificateTokenId;
  // Rendered by the backend in the current certificate design from the stored
  // certificate data; the download variant is a 2000 px attachment.
  const imageUrl = tokenId ? certificateImageUrl(tokenId) : null;
  const downloadUrl = tokenId ? certificateImageUrl(tokenId, 'download') : null;
  const imageAlt = `SALX carbon retirement certificate SBT #${tokenId}: ${certificate.retiredCO2Kg.toLocaleString('en-US')} kg CO₂e retired`;

  const pMeta = (project?.projectMetadata as any) ?? null;
  const findAttr = (type: string): string | undefined =>
    (pMeta?.attributes as any[])?.find((a: any) => a.trait_type === type)?.value;
  const methodology = pMeta?.properties?.methodology || findAttr('Methodology');
  const projectType = pMeta?.properties?.project_type || findAttr('Project Type');

  const explorer = env.blockExplorerUrl;
  const beneficiaryLink = `${explorer}/address/${certificate.ownerAddress}`;
  const contractLink = env.certificateAddress ? `${explorer}/address/${env.certificateAddress}` : undefined;

  const copyUrl = () => {
    const url = certificate.certificateURIHttp || certificate.certificateURI || window.location.href;
    navigator.clipboard.writeText(url)
      .then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1600); })
      .catch(() => {});
  };

  const button = { fontFamily: BODY, fontSize: 12, fontWeight: 500, borderRadius: 6, padding: '8px 14px', textDecoration: 'none', cursor: 'pointer', lineHeight: 1.2 } as const;
  const link = { fontFamily: BODY, fontSize: 12, fontWeight: 500, textDecoration: 'none', lineHeight: 1.6 } as const;

  return (
    // Wraps on its own: certificate beside the details when there is room,
    // stacked in narrow columns (Retire page, phones, multi-certificate grids).
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 12, padding: 12, background: 'var(--surf)', border: `1px solid ${BD}`, borderRadius: 12, fontFamily: BODY }}>

      {/* ── The certificate itself ── */}
      <div style={{ flex: '1 1 300px', maxWidth: 520, minWidth: 0 }}>
        {imageUrl && imageState !== 'error' ? (
          <button type="button" className="cert-zoom-trigger" onClick={() => setZoomed(true)} aria-label={`Zoom in on certificate SBT #${tokenId}`}>
            {imageState === 'loading' && (
              <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontFamily: MONO, fontSize: 11, letterSpacing: '.08em', color: '#56655d' }}>
                Preparing certificate…
              </span>
            )}
            <img
              src={imageUrl}
              alt={imageAlt}
              width={1000}
              height={1000}
              loading={eager ? 'eager' : 'lazy'}
              decoding="async"
              onLoad={() => setImageState('ready')}
              onError={() => setImageState('error')}
              style={{ display: 'block', width: '100%', height: '100%', opacity: imageState === 'ready' ? 1 : 0, transition: 'opacity .3s ease-out' }}
            />
            {imageState === 'ready' && <span className="cert-zoom-trigger__hint" aria-hidden="true">CLICK TO ZOOM</span>}
          </button>
        ) : (
          <div style={{ aspectRatio: '1 / 1', display: 'grid', placeItems: 'center', textAlign: 'center', padding: 24, background: 'var(--surf2)', borderRadius: 6, fontSize: 13, lineHeight: 1.6, color: 'var(--mut)' }}>
            {imageUrl
              ? 'The certificate image could not be loaded. The backend may be waking up — reload in a minute.'
              : 'The certificate image appears once the SBT has been minted.'}
          </div>
        )}
      </div>

      <div style={{ flex: '1 1 260px', minWidth: 0 }}>
        {/* ── Actions: one primary download, secondary links beneath ── */}
        <div>
          {downloadUrl && (
            <a href={downloadUrl} download style={{ ...button, display: 'block', textAlign: 'center', fontWeight: 600, fontSize: 13, padding: '10px 14px', color: 'var(--bg)', background: 'var(--g)', border: '1px solid var(--g)' }}>
              Download certificate (PNG)
            </a>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '4px 18px', padding: '10px 0 2px' }}>
            {certificate.explorerURL && (
              <a href={certificate.explorerURL} target="_blank" rel="noreferrer" style={{ ...link, color: 'var(--ink)' }}>
                View on Snowtrace ↗
              </a>
            )}
            <button type="button" onClick={copyUrl} style={{ ...link, color: 'var(--mut)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
              {copied ? 'Copied ✓' : 'Copy certificate URL'}
            </button>
          </div>
        </div>

        {/* ── Verification details not printed on the certificate ── */}
        <div style={{ padding: '8px 4px 0' }}>
          <DetailRow label="Token" value={`SBT #${tokenId ?? '—'}`} />
          {methodology && <DetailRow label="Methodology" value={String(methodology)} />}
          {projectType && <DetailRow label="Project type" value={String(projectType)} />}
          <DetailRow label="Retired on" value={formatDate(certificate.mintedAt)} />
          <DetailRow label="Beneficiary wallet" value={shortAddress(certificate.ownerAddress, 8, 6)} href={beneficiaryLink} mono />
          {contractLink && <DetailRow label="Certificate contract" value={shortAddress(env.certificateAddress, 8, 6)} href={contractLink} mono />}
        </div>
      </div>

      {imageUrl && downloadUrl && (
        <CertificateLightbox
          open={zoomed}
          onClose={() => setZoomed(false)}
          imageUrl={imageUrl}
          downloadUrl={downloadUrl}
          title={`SBT #${tokenId} · ${certificate.retiredCO2Kg.toLocaleString('en-US')} kg CO₂e`}
          alt={imageAlt}
        />
      )}
    </div>
  );
}
