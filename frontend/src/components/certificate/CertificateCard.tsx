import { useMemo } from 'react';
import type { Certificate, CertificateSource, Project } from '../../types/domain';
import { formatDate, formatNumber, shortAddress } from '../../lib/format';
import { ipfsToHttp } from '../../lib/projectMeta';
import { env } from '../../config/env';
import logo from '../../assets/salx-app-icon.png';

const INTER = "'Inter', sans-serif";
const SYNE  = "'Syne', sans-serif";
const MONO  = "'JetBrains Mono', monospace";

const BD  = 'var(--bd-str)';
const BD2 = 'var(--bd-soft)';

function normalizedSources(certificate: Certificate): CertificateSource[] {
  if (Array.isArray(certificate.sources) && certificate.sources.length) return certificate.sources;
  const raw = (certificate.metadata as any)?.sources
    || (certificate.metadata as any)?.breakdown
    || (certificate.metadata as any)?.composition;
  if (Array.isArray(raw) && raw.length) {
    return raw.map((s: any, i: number) => ({
      projectId: Number(s.projectId ?? s.project_id ?? (certificate.projectId || i + 1)),
      projectName: String(s.projectName ?? s.name ?? `Project #${s.projectId ?? certificate.projectId}`),
      retiredTokenAmount: Number(s.retiredTokenAmount ?? s.salAmount ?? s.sal_amount ?? 0),
      retiredCO2Kg: Number(s.retiredCO2Kg ?? s.co2Kg ?? s.co2_kg ?? 0),
    }));
  }
  return [{
    projectId: certificate.projectId,
    projectName: certificate.projectName || `Project #${certificate.projectId}`,
    retiredTokenAmount: certificate.retiredTokenAmount,
    retiredCO2Kg: certificate.retiredCO2Kg,
  }];
}

function vintageYear(cert: Certificate, pMeta?: any): string {
  const raw =
    pMeta?.properties?.monitoring_period?.start ||
    pMeta?.attributes?.find((a: any) => a.trait_type === 'Monitoring Start')?.value ||
    (cert.metadata as any)?.monitoringStart ||
    (cert.metadata as any)?.vintage ||
    cert.mintedAt;
  if (!raw) return '—';
  const d = new Date(raw);
  return Number.isNaN(d.getFullYear()) ? '—' : String(d.getFullYear());
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, background: 'var(--surf2)', border: `1px solid ${BD}`, borderRadius: 8, padding: '8px 12px', minWidth: 0 }}>
      <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--mut)' }}>{label}</span>
      <span style={{ fontFamily: INTER, fontSize: 13, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span>
    </div>
  );
}

function MetaCell({ label, value, link, mono }: { label: string; value: string; link?: string; mono?: boolean }) {
  const valueFont = mono ? MONO : INTER;
  const valueSz   = mono ? 11   : 13;
  return (
    <div style={{ padding: '12px 14px', borderBottom: `1px solid ${BD2}` }}>
      <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--mut)', marginBottom: 6 }}>{label}</div>
      {link ? (
        <a href={link} target="_blank" rel="noreferrer" style={{ fontFamily: valueFont, fontSize: valueSz, fontWeight: mono ? 400 : 500, color: 'var(--g)', textDecoration: 'none', wordBreak: 'break-all' }}>
          {value} <span style={{ fontSize: 10 }}>↗</span>
        </a>
      ) : (
        <span style={{ fontFamily: valueFont, fontSize: valueSz, fontWeight: mono ? 400 : 500, color: 'var(--ink)', wordBreak: 'break-all' }}>{value}</span>
      )}
    </div>
  );
}

export function CertificateCard({ certificate, project }: { certificate: Certificate; project?: Project }) {
  const sources = useMemo(() => normalizedSources(certificate), [certificate]);
  const projectName = certificate.projectName || sources[0]?.projectName || `Project #${certificate.projectId}`;

  const pMeta = (project?.projectMetadata as any) ?? null;
  const findAttr = (type: string): string | undefined =>
    (pMeta?.attributes as any[])?.find((a: any) => a.trait_type === type)?.value;

  // Use project photo as hero; certificate.imageURI is the cert SVG artifact, not a photo
  const heroImage = ipfsToHttp(pMeta?.image || certificate.imageURL || null);

  const co2Kg = certificate.retiredCO2Kg;
  const tonnes = (co2Kg / 1000).toFixed(1);
  const carbonStandard = (certificate.metadata as any)?.carbonStandard || 'SALX Standard';
  const methodology = pMeta?.properties?.methodology || findAttr('Methodology') || '—';
  const creditCategory = pMeta?.properties?.project_type || findAttr('Project Type') || '—';
  const issuerWallet = env.sal1155Address;
  const explorerBase = env.blockExplorerUrl;
  const beneficiaryWalletLink = `${explorerBase}/address/${certificate.ownerAddress}`;
  // The API answers with Content-Disposition: attachment, so a plain link downloads the PNG.
  const downloadUrl = certificate.certificateTokenId
    ? `${env.apiUrl}/api/certificates/token/${certificate.certificateTokenId}/image.png`
    : null;
  const issuerWalletLink = issuerWallet ? `${explorerBase}/address/${issuerWallet}` : undefined;

  const copyUrl = () => {
    const url = certificate.certificateURIHttp || certificate.certificateURI || window.location.href;
    navigator.clipboard.writeText(url).catch(() => {});
  };

  return (
    <div style={{ background: 'var(--surf)', border: `1px solid ${BD}`, borderRadius: 12, overflow: 'hidden', fontFamily: INTER }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: `1px solid ${BD}` }}>
        <div>
          <div style={{ fontFamily: INTER, fontSize: 17, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.2 }}>Carbon Retirement Certificate</div>
          <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--mut)', marginTop: 5 }}>SBT #{certificate.certificateTokenId ?? '—'}</div>
        </div>
        <img src={logo} alt="SALX" style={{ width: 36, height: 36, borderRadius: 8 }} />
      </div>

      {/* ── Hero ── */}
      <div style={{ position: 'relative', height: 200, background: 'linear-gradient(135deg,#04211b,#062e25 60%,#031713)', overflow: 'hidden' }}>
        {heroImage && (
          <img src={heroImage} alt="" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', filter: 'brightness(.55) saturate(.8)' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(4,33,27,.88) 0%, rgba(4,33,27,.30) 60%, transparent 100%)' }} />
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%', padding: '18px 20px' }}>
          <div style={{ fontFamily: INTER, fontSize: 12, fontWeight: 400, color: 'rgba(209,250,229,.65)', marginBottom: 8 }}>This certificate is proof that</div>
          <span style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(34px,5vw,50px)', lineHeight: 1, letterSpacing: 0, color: '#eafff7' }}>
            {formatNumber(co2Kg)} kg CO<sub style={{ fontSize: '0.55em', verticalAlign: 'sub', fontWeight: 900 }}>2</sub>e
          </span>
          <div style={{ fontFamily: INTER, fontSize: 13, fontWeight: 400, color: 'rgba(209,250,229,.60)', marginTop: 8 }}>({tonnes} tonnes) credits have been permanently retired</div>
        </div>
      </div>

      {/* ── Pills ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '14px 18px', borderBottom: `1px solid ${BD}` }}>
        <Pill label="Credit Category" value={creditCategory} />
        <Pill label="Standard"        value={carbonStandard} />
        <Pill label="Vintage"         value={vintageYear(certificate, pMeta)} />
        <Pill label="Issuer"          value="SALX" />
      </div>

      {/* ── Project row ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: `1px solid ${BD}` }}>
        <img src={logo} alt="SALX" style={{ width: 36, height: 36, borderRadius: 8, flexShrink: 0, objectFit: 'cover' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: INTER, fontWeight: 600, fontSize: 15, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{projectName}</div>
          <div style={{ fontFamily: INTER, fontSize: 12, fontWeight: 400, color: 'var(--mut)', marginTop: 3 }}>by SALX</div>
        </div>
        {certificate.explorerURL && (
          <a href={certificate.explorerURL} target="_blank" rel="noreferrer" style={{ fontFamily: INTER, fontSize: 12, fontWeight: 500, color: 'var(--g)', textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}>
            View on-chain ↗
          </a>
        )}
      </div>

      {/* ── Multi-project breakdown ── */}
      {sources.length > 1 && (() => {
        const maxKg = Math.max(...sources.map(s => s.retiredCO2Kg));
        return (
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${BD}` }}>
            <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--mut)', marginBottom: 13 }}>
              Carbon credit breakdown — {sources.length} projects
            </div>
            {sources.map((src, i) => {
              const pct = maxKg > 0 ? Math.round((src.retiredCO2Kg / maxKg) * 100) : 0;
              return (
                <div key={src.projectId ?? i} style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: i < sources.length - 1 ? 11 : 0 }}>
                  <span style={{ fontFamily: MONO, fontSize: 7, color: 'var(--g)', background: 'var(--gb)', borderRadius: 3, padding: '2px 6px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    #{src.projectId ?? i + 1}
                  </span>
                  <span style={{ fontFamily: INTER, fontSize: 12, color: 'var(--ink)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {src.projectName}
                  </span>
                  <div style={{ flexShrink: 0, width: 136 }}>
                    <div style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mut)', textAlign: 'right', marginBottom: 4 }}>
                      {src.retiredCO2Kg.toLocaleString()} kg · {src.retiredTokenAmount} SAL
                    </div>
                    <div style={{ height: 4, background: 'var(--surf2)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: 'var(--g)', borderRadius: 2 }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* ── Retirement statement ── */}
      <div style={{ background: 'var(--surf2)', margin: '14px 18px 0', borderRadius: 8, padding: '14px 16px' }}>
        <p style={{ fontFamily: INTER, fontSize: 13, fontWeight: 400, lineHeight: 1.7, color: 'var(--ink)', margin: 0 }}>
          We are hereby permanently retiring{' '}
          <strong style={{ fontWeight: 600, color: 'var(--g)' }}>{formatNumber(co2Kg)} kg CO₂ equivalent</strong>{' '}
          ({certificate.retiredTokenAmount} SAL) on behalf of{' '}
          <strong style={{ fontFamily: MONO, fontSize: 12, fontWeight: 400, color: 'var(--ink)' }}>{shortAddress(certificate.ownerAddress)}</strong>.
          {sources.length > 1 && ` Retirement spans ${sources.length} carbon credit projects.`}
        </p>
      </div>

      {/* ── Metadata grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', margin: '14px 18px 0', border: `1px solid ${BD}`, borderRadius: 8, overflow: 'hidden' }}>
        <MetaCell label="Carbon Standard"   value={carbonStandard} />
        <MetaCell label="Vintage"           value={vintageYear(certificate, pMeta)} />
        <MetaCell label="Methodology"       value={methodology} />
        <MetaCell label="Credit Category"   value={creditCategory} />
        <MetaCell label="Issuer"            value="SALX" />
        <MetaCell label="Issuer Wallet"     value={issuerWallet ? shortAddress(issuerWallet) : '—'} link={issuerWalletLink} mono />
        <MetaCell label="Credits Retired On" value={formatDate(certificate.mintedAt)} />
        <MetaCell label="Beneficiary"       value={shortAddress(certificate.ownerAddress)} mono />
        <MetaCell label="Beneficiary Wallet" value={shortAddress(certificate.ownerAddress, 8, 6)} link={beneficiaryWalletLink} mono />
      </div>

      {/* ── Footer ── */}
      <div style={{ padding: '14px 18px 18px' }}>
        <p style={{ fontFamily: INTER, fontSize: 11, fontWeight: 400, lineHeight: 1.75, color: 'var(--mut)', margin: '0 0 14px' }}>
          This certificate guarantees the permanent, on-chain retirement of {formatNumber(co2Kg)} kg CO₂ equivalent
          ({tonnes} tonnes). The carbon footprint has been offset using credits registered in the SALX marketplace.
          Verification is permanently recorded on the Avalanche blockchain.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {downloadUrl && (
            <a
              href={downloadUrl}
              download
              style={{ fontFamily: INTER, fontSize: 12, fontWeight: 600, color: 'var(--bg)', border: '1px solid var(--g)', borderRadius: 6, padding: '7px 14px', textDecoration: 'none', background: 'var(--g)' }}
            >
              Download certificate (PNG)
            </a>
          )}
          {certificate.explorerURL && (
            <a
              href={certificate.explorerURL}
              target="_blank"
              rel="noreferrer"
              style={{ fontFamily: INTER, fontSize: 12, fontWeight: 500, color: 'var(--ink)', border: `1px solid ${BD}`, borderRadius: 6, padding: '7px 14px', textDecoration: 'none', background: 'var(--surf2)' }}
            >
              View on Snowtrace ↗
            </a>
          )}
          <button
            type="button"
            onClick={copyUrl}
            style={{ fontFamily: INTER, fontSize: 12, fontWeight: 500, color: 'var(--mut)', border: `1px solid ${BD}`, borderRadius: 6, padding: '7px 14px', background: 'none', cursor: 'pointer' }}
          >
            Copy certificate URL
          </button>
        </div>
      </div>

    </div>
  );
}
