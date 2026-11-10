import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import type { Certificate, OnChainCertificate } from '../types/domain';
import { backend } from '../services/backend';
import { ApiError } from '../services/api';
import { certificateOnChain } from '../services/blockchain';
import { env } from '../config/env';
import { formatCO2, formatDate, shortAddress } from '../lib/format';
import {
  linkedInShareUrl,
  qrMatrix,
  qrSvgFile,
  shareLinkUrl,
  shareText,
  verifyPageUrl,
  xShareUrl,
} from '../lib/certificateShare';
import { CertificateCard } from '../components/certificate/CertificateCard';
import './VerifyCertificatePage.css';

type Load<T> = { state: 'loading' } | { state: 'ready'; value: T } | { state: 'missing' } | { state: 'error' };

type Tone = 'ok' | 'warn' | 'bad' | 'neutral';

/** Whether SALX's stored copy says the same as the contract. */
function recordMatchesChain(record: Certificate, chain: OnChainCertificate) {
  return record.ownerAddress.toLowerCase() === chain.owner
    && Number(record.retiredCO2Kg) === chain.co2Kg
    && (!record.certificateURI || record.certificateURI === chain.certificateURI);
}

function Check({ tone, label, children }: { tone: Tone; label: string; children: ReactNode }) {
  const icon = tone === 'ok' ? '✓' : tone === 'bad' ? '!' : tone === 'warn' ? '!' : '–';
  return (
    <li className={`verify-check is-${tone}`}>
      <span className="verify-check__icon" aria-hidden="true">{icon}</span>
      <span className="verify-check__label">{label}</span>
      <span className="verify-check__value">{children}</span>
    </li>
  );
}

function ExplorerLink({ path, children }: { path: string; children: ReactNode }) {
  return <a href={`${env.blockExplorerUrl}/${path}`} target="_blank" rel="noreferrer">{children} ↗</a>;
}

/**
 * Public page for one certificate: anyone with the link or QR code can check
 * it against the SBT contract on Avalanche, without a wallet and without
 * trusting SALX's own database.
 */
export function VerifyCertificatePage() {
  const { tokenId: param } = useParams();
  const tokenId = Number(param);
  const validId = Number.isSafeInteger(tokenId) && tokenId > 0;

  const [chain, setChain] = useState<Load<OnChainCertificate>>({ state: 'loading' });
  const [record, setRecord] = useState<Load<Certificate>>({ state: 'loading' });
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    if (!validId) return () => {};
    let cancelled = false;
    setChain({ state: 'loading' });
    setRecord({ state: 'loading' });
    certificateOnChain(tokenId)
      .then(value => { if (!cancelled) setChain(value ? { state: 'ready', value } : { state: 'missing' }); })
      .catch(() => { if (!cancelled) setChain({ state: 'error' }); });
    backend.certificateByToken(tokenId)
      .then(value => { if (!cancelled) setRecord({ state: 'ready', value }); })
      .catch(error => {
        if (cancelled) return;
        setRecord(error instanceof ApiError && error.status === 404 ? { state: 'missing' } : { state: 'error' });
      });
    return () => { cancelled = true; };
  }, [tokenId, validId]);

  useEffect(() => load(), [load]);

  useEffect(() => {
    const previous = document.title;
    document.title = validId ? `Certificate SBT #${tokenId} · SALX` : 'Certificate · SALX';
    return () => { document.title = previous; };
  }, [tokenId, validId]);

  const pageUrl = validId ? verifyPageUrl(tokenId) : '';
  const qr = useMemo(() => (pageUrl ? qrMatrix(pageUrl) : null), [pageUrl]);
  const qrDownload = useMemo(
    () => (qr ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvgFile(qr))}` : ''),
    [qr],
  );

  const onChain = chain.state === 'ready' ? chain.value : null;
  const stored = record.state === 'ready' ? record.value : null;
  const matches = onChain && stored ? recordMatchesChain(stored, onChain) : null;

  const projectLabel = stored
    ? (stored.projectCount && stored.projectCount > 1 ? `${stored.projectCount} projects` : stored.projectName || stored.sources?.[0]?.projectName)
    : onChain && onChain.projectCount > 1 ? `${onChain.projectCount} projects` : undefined;
  const co2Kg = onChain?.co2Kg ?? stored?.retiredCO2Kg;

  let verdict: { tone: Tone; title: string; detail: string };
  if (!validId) {
    verdict = { tone: 'bad', title: 'Not a certificate number', detail: 'Check the link: certificate numbers are whole numbers such as /verify/3.' };
  } else if (chain.state === 'loading') {
    verdict = { tone: 'neutral', title: 'Checking the certificate on Avalanche…', detail: 'Reading it straight from the SALX certificate contract.' };
  } else if (chain.state === 'missing') {
    verdict = { tone: 'bad', title: `No certificate SBT #${tokenId} exists`, detail: 'The SALX certificate contract has never issued this number.' };
  } else if (chain.state === 'error') {
    verdict = { tone: 'warn', title: 'Could not reach Avalanche', detail: 'The certificate could not be checked right now. Try again in a moment.' };
  } else if (onChain?.revoked) {
    verdict = { tone: 'bad', title: 'This certificate was revoked', detail: 'It still exists on Avalanche but is no longer valid.' };
  } else if (matches === false) {
    verdict = { tone: 'warn', title: 'On Avalanche, but SALX’s copy differs', detail: 'Trust the on-chain details below; the stored copy does not match them.' };
  } else {
    verdict = { tone: 'ok', title: `Verified on ${env.chainName}`, detail: 'Checked just now against the SALX certificate contract, not SALX’s own database.' };
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(pageUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const shareable = Boolean(onChain && !onChain.revoked);

  return (
    <div className="home-dc verify" style={{ animation: 'fadeUp .35s ease' }}>
      <div className="home-dc-section verify__inner">
        <header className="verify__head">
          <p className="verify__eyebrow">Public verification</p>
          <h1 className="verify__title">{validId ? `Certificate SBT #${tokenId}` : 'Certificate'}</h1>
          {co2Kg != null && (
            <p className="verify__sub">
              {formatCO2(co2Kg, 'en-US')} retired{projectLabel ? ` · ${projectLabel}` : ''}
            </p>
          )}
        </header>

        <section className={`verify__verdict is-${verdict.tone}`} role="status" aria-live="polite">
          <span className="verify__verdict-icon" aria-hidden="true">
            {verdict.tone === 'ok' ? '✓' : verdict.tone === 'neutral' ? '…' : '!'}
          </span>
          <div>
            <strong>{verdict.title}</strong>
            <span>{verdict.detail}</span>
          </div>
          {chain.state === 'error' && (
            <button type="button" className="verify__retry verify__no-print" onClick={load}>Try again</button>
          )}
        </section>

        {/* Nothing to lay out for a number that was never issued. */}
        {validId && !(chain.state === 'missing' && !stored) && (
        <div className="verify__grid">
          <div className="verify__certificate">
            {stored ? (
              <CertificateCard certificate={stored} eager showVerifyLink={false} />
            ) : (
              <div className="verify__placeholder">
                {record.state === 'loading'
                  ? 'Loading the certificate artwork…'
                  : 'The certificate artwork is not available right now. The on-chain details beside it are what count.'}
              </div>
            )}
          </div>

          <aside className="verify__side">
            {onChain && (
              <section className="verify__panel">
                <h2 className="verify__panel-title">On-chain record</h2>
                <ul className="verify__checks">
                  <Check tone="ok" label="Issued by">
                    <ExplorerLink path={`address/${env.certificateAddress}`}>SALX certificate contract</ExplorerLink>
                  </Check>
                  <Check tone="ok" label="Held by">
                    <ExplorerLink path={`address/${onChain.owner}`}>{shortAddress(onChain.owner, 8, 6)}</ExplorerLink>
                  </Check>
                  <Check tone="ok" label="Retired">
                    {formatCO2(onChain.co2Kg, 'en-US')} · {onChain.salAmount.toLocaleString('en-US')} SAL
                  </Check>
                  <Check tone="ok" label="Date">{formatDate(onChain.retiredAt * 1000, 'en-US')}</Check>
                  <Check tone={onChain.revoked ? 'bad' : 'ok'} label="Status">
                    {onChain.revoked ? 'Revoked' : 'Active, cannot be transferred or resold'}
                  </Check>
                  <Check
                    tone={matches === true ? 'ok' : matches === false ? 'warn' : 'neutral'}
                    label="SALX record"
                  >
                    {matches === true ? 'Matches the chain' : matches === false ? 'Differs from the chain' : record.state === 'loading' ? 'Checking…' : 'Not available'}
                  </Check>
                </ul>
                {stored?.txHash && (
                  <p className="verify__tx">
                    <ExplorerLink path={`tx/${stored.txHash}`}>View the retirement transaction</ExplorerLink>
                  </p>
                )}
              </section>
            )}

            {shareable && qr && (
              <section className="verify__panel verify__share">
                <h2 className="verify__panel-title">Share and print</h2>
                <div className="verify__qr-row">
                  <svg
                    className="verify__qr"
                    viewBox={`0 0 ${qr.size} ${qr.size}`}
                    role="img"
                    aria-label={`QR code linking to ${pageUrl}`}
                    shapeRendering="crispEdges"
                  >
                    <rect width={qr.size} height={qr.size} fill="#ffffff" />
                    <path d={qr.path} fill="#0b1311" />
                  </svg>
                  <div className="verify__qr-text">
                    <span>Scan to open this page and check the certificate.</span>
                    <code>{pageUrl.replace(/^https?:\/\//, '')}</code>
                  </div>
                </div>
                <div className="verify__actions verify__no-print">
                  <a className="verify__button is-primary" href={linkedInShareUrl(shareLinkUrl(tokenId))} target="_blank" rel="noreferrer">
                    Share on LinkedIn
                  </a>
                  <a className="verify__button" href={xShareUrl(shareLinkUrl(tokenId), shareText(tokenId, onChain!.co2Kg))} target="_blank" rel="noreferrer">
                    Share on X
                  </a>
                  <button type="button" className="verify__button" onClick={copyLink}>{copied ? 'Link copied ✓' : 'Copy link'}</button>
                  <a className="verify__button" href={qrDownload} download={`SALX-SBT-${tokenId}-QR.svg`}>Download QR</a>
                  <button type="button" className="verify__button" onClick={() => window.print()}>Print or save as PDF</button>
                </div>
              </section>
            )}
          </aside>
        </div>
        )}
      </div>
    </div>
  );
}
