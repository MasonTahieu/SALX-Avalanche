/**
 * esgAuditPdf.ts
 *
 * Renders and prints an ESG Audit PDF-ready report for a SALX certificate.
 * Uses window.print() on a dedicated hidden iframe so the rest of the page
 * is not affected. The template is a clean, white, enterprise-grade document.
 */

import type { Certificate, Project } from '../types/domain';
import { env } from '../config/env';
import { formatCO2, formatDate, shortAddress } from './format';
import { verifyPageUrl } from './certificateShare';
import { AVAX_TO_USDC, AVAX_TO_VND } from './currency';

export { AVAX_TO_USDC, AVAX_TO_VND };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function kgToMetricTonnes(kg: number): string {
  // Always show at least 4 decimal places so "10 kg" → "0.0100 metric tonnes"
  return (kg / 1000).toFixed(4);
}

/** Minimal QR SVG (path-only, no library dependency at render time). */
function qrPlaceholderSvg(url: string): string {
  // We generate a data-uri for the verify URL as a simple reference text block
  // since qrcode-generator may not be available in the print context.
  // A real QR code is shown via the main page; here we render the URL as text.
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="120" height="120" style="border:2px solid #ccc;border-radius:6px;">
      <rect width="200" height="200" fill="#f9fafb"/>
      <text x="100" y="80" text-anchor="middle" font-size="10" fill="#444" font-family="monospace">Scan on</text>
      <text x="100" y="96" text-anchor="middle" font-size="10" fill="#444" font-family="monospace">Snowtrace</text>
      <text x="100" y="130" text-anchor="middle" font-size="8" fill="#888" font-family="monospace" textLength="180" lengthAdjust="spacing">${url.replace(/^https?:\/\//, '').slice(0, 38)}</text>
    </svg>`;
}

function escHtml(s: string | number | undefined | null): string {
  if (s == null) return '—';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Opens a print dialog for a fully-rendered ESG Audit certificate.
 * The user can choose "Save as PDF" in the print dialog.
 *
 * @param cert  The Certificate object from SALX backend / blockchain.
 */
export function exportEsgAuditPdf(cert: Certificate, project?: Project): void {
  const tokenId   = cert.certificateTokenId;
  const owner     = cert.ownerAddress;
  const co2Kg     = Number(cert.retiredCO2Kg ?? 0);
  const co2Tonnes = kgToMetricTonnes(co2Kg);
  const txHash    = cert.txHash ?? '';
  const mintedAt  = cert.mintedAt ?? '';
  const pageUrl   = verifyPageUrl(tokenId, window.location.origin);
  const explorerTxUrl = txHash
    ? `${env.blockExplorerUrl}/tx/${txHash}`
    : `${env.blockExplorerUrl}`;
  // Use full transaction hash and contract address (no shortAddress) for institutional reports
  const explorerAddrUrl = `${env.blockExplorerUrl}/address/${owner}`;

  // Build sources table rows
  const pName = cert.projectName || project?.projectName;
  const sources = (cert.sources && cert.sources.length > 0)
    ? cert.sources
    : (pName
      ? [{ projectName: pName, projectId: cert.projectId ?? project?.onChainProjectId, retiredTokenAmount: cert.retiredTokenAmount, retiredCO2Kg: co2Kg }]
      : []);

  const sourceRows = sources.length > 0
    ? sources.map((s, i) => `
        <tr style="border-bottom:1px solid #e5e7eb;">
          <td style="padding:8px 10px;font-size:13px;color:#374151;">${escHtml(i + 1)}</td>
          <td style="padding:8px 10px;font-size:13px;color:#374151;">${escHtml(s.projectName ?? '—')}</td>
          <td style="padding:8px 10px;font-size:13px;color:#374151;text-align:right;">${escHtml(s.retiredTokenAmount ?? '—')} SAL</td>
          <td style="padding:8px 10px;font-size:13px;color:#374151;text-align:right;">${escHtml(formatCO2(s.retiredCO2Kg, 'en-US'))}</td>
        </tr>`).join('')
    : `<tr><td colspan="4" style="padding:10px;text-align:center;color:#9ca3af;font-size:13px;">No source breakdown available</td></tr>`;

  const issuedDateStr = mintedAt ? formatDate(mintedAt, 'en-US') : '—';
  const printDateStr  = formatDate(Date.now(), 'en-US');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>ESG Audit Certificate – SBT #${tokenId}</title>
  <style>
    @page { size: A4 portrait; margin: 10mm 10mm; }
    @media print {
      body { font-size: 10px; }
      .hdr { padding-bottom: 12px; margin-bottom: 16px; }
      .card-value { font-size: 14px; }
      .detail-value { font-size: 10px; }
      .table-block th, .table-block td { padding: 6px 8px; font-size: 10px; }
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Helvetica Neue', Arial, sans-serif;
      color: #111827;
      background: #ffffff;
      line-height: 1.5;
    }

    /* ── Header ── */
    .hdr {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-bottom: 16px;
      border-bottom: 3px solid #16a34a;
      margin-bottom: 24px;
    }
    .hdr-brand { display: flex; align-items: center; gap: 10px; }
    .hdr-logo {
      width: 40px; height: 40px;
      background: #16a34a;
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      color: #fff; font-size: 20px; font-weight: 900;
    }
    .hdr-name { font-size: 22px; font-weight: 800; color: #111827; letter-spacing: -.01em; }
    .hdr-sub  { font-size: 11px; color: #6b7280; letter-spacing: .06em; text-transform: uppercase; }
    .hdr-doc  { text-align: right; }
    .hdr-doc-title { font-size: 15px; font-weight: 700; color: #111827; }
    .hdr-doc-id    { font-size: 11px; color: #6b7280; font-family: monospace; margin-top: 2px; }

    /* ── Validity banner ── */
    .banner {
      background: #f0fdf4;
      border: 1.5px solid #86efac;
      border-radius: 10px;
      padding: 14px 18px;
      margin-bottom: 24px;
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .banner-icon {
      flex: none; width: 36px; height: 36px;
      background: #16a34a; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      color: #fff; font-size: 20px; font-weight: 900;
    }
    .banner-text strong { font-size: 15px; font-weight: 700; color: #15803d; }
    .banner-text span   { font-size: 12px; color: #4b7a57; display: block; margin-top: 2px; }

    /* ── Two-column summary ── */
    .summary {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 24px;
    }
    .card {
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      padding: 14px 16px;
    }
    .card-label {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: .1em;
      text-transform: uppercase;
      color: #9ca3af;
      margin-bottom: 6px;
    }
    .card-value { font-size: 15px; font-weight: 700; color: #111827; }
    .card-value.green { color: #16a34a; font-size: 20px; }
    .card-sub { font-size: 11px; color: #6b7280; margin-top: 3px; }

    /* ── Blockchain detail ── */
    .detail-block {
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      padding: 14px 16px;
      margin-bottom: 24px;
    }
    .detail-block h2 {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: .1em;
      text-transform: uppercase;
      color: #9ca3af;
      margin-bottom: 10px;
    }
    .detail-row {
      display: flex;
      justify-content: space-between;
      padding: 7px 0;
      border-bottom: 1px solid #f3f4f6;
      font-size: 13px;
    }
    .detail-row:last-child { border-bottom: none; }
    .detail-key   { color: #6b7280; }
    .detail-value { color: #111827; font-family: monospace; font-size: 12px; word-break: break-all; text-align: right; max-width: 60%; }
    .detail-value a { color: #16a34a; text-decoration: none; }

    /* ── Sources table ── */
    .table-block { margin-bottom: 24px; }
    .table-block h2 {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: .1em;
      text-transform: uppercase;
      color: #9ca3af;
      margin-bottom: 10px;
    }
    table { width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
    thead th {
      background: #f9fafb;
      padding: 9px 10px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: .05em;
      color: #6b7280;
      text-align: left;
      border-bottom: 1px solid #e5e7eb;
    }
    thead th:last-child, thead th:nth-child(3) { text-align: right; }

    /* ── QR + footer row ── */
    .bottom-row {
      display: flex;
      align-items: flex-start;
      gap: 20px;
      margin-bottom: 20px;
    }
    .qr-block { flex: none; }
    .qr-label { font-size: 10px; color: #9ca3af; text-align: center; margin-top: 6px; letter-spacing: .05em; text-transform: uppercase; }
    .qr-url   { font-size: 9px; color: #6b7280; font-family: monospace; word-break: break-all; margin-top: 3px; }
    .disclaimer {
      flex: 1;
      font-size: 10.5px;
      color: #9ca3af;
      line-height: 1.6;
      border-top: 1px solid #e5e7eb;
      padding-top: 10px;
    }
    .disclaimer strong { color: #6b7280; }

    /* ── Footer ── */
    .footer {
      border-top: 1px solid #e5e7eb;
      padding-top: 10px;
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: #9ca3af;
    }
  </style>
</head>
<body>

  <!-- HEADER -->
  <div class="hdr">
    <div class="hdr-brand">
      <div class="hdr-logo">S</div>
      <div>
        <div class="hdr-name">SALX</div>
        <div class="hdr-sub">Carbon Retirement Platform · Avalanche</div>
      </div>
    </div>
    <div class="hdr-doc">
      <div class="hdr-doc-title">ESG Audit Certificate</div>
      <div class="hdr-doc-id">SBT #${tokenId} · Avalanche Fuji</div>
    </div>
  </div>

  <!-- VALIDITY BANNER -->
  <div class="banner">
    <div class="banner-icon">✓</div>
    <div class="banner-text">
      <strong>Verified on Avalanche – Soul-Bound Token (SBT)</strong>
      <span>This certificate is permanently recorded on-chain and cannot be transferred or reused.</span>
    </div>
  </div>

  <!-- SUMMARY CARDS -->
  <div class="summary">
    <div class="card">
      <div class="card-label">CO₂ Offset (Metric Tonnes)</div>
      <div class="card-value green">${escHtml(co2Tonnes)} tCO₂e</div>
      <div class="card-sub">≡ ${escHtml(formatCO2(co2Kg, 'en-US'))} (${escHtml(co2Kg)} kg CO₂e raw)</div>
    </div>
    <div class="card">
      <div class="card-label">Certificate Holder</div>
      <div class="card-value" style="font-size:13px;font-family:monospace;">${escHtml(owner)}</div>
      <div class="card-sub">Short: ${escHtml(shortAddress(owner, 8, 6))}</div>
    </div>
    <div class="card">
      <div class="card-label">Issue Date</div>
      <div class="card-value">${escHtml(issuedDateStr)}</div>
    </div>
    <div class="card">
      <div class="card-label">SAL Tokens Retired</div>
      <div class="card-value">${escHtml(cert.retiredTokenAmount)} SAL</div>
      <div class="card-sub">10 kg CO₂e per 1 SAL token</div>
    </div>
  </div>

  <!-- ON-CHAIN DETAIL -->
  <div class="detail-block">
    <h2>Blockchain Record (Avalanche Fuji C-Chain)</h2>
    <div class="detail-row">
      <span class="detail-key">Token ID</span>
      <span class="detail-value">SBT #${escHtml(tokenId)}</span>
    </div>
    <div class="detail-row">
      <span class="detail-key">Contract (SALX Certificate SBT)</span>
      <span class="detail-value"><a href="${escHtml(env.blockExplorerUrl)}/address/${escHtml(env.certificateAddress)}">${escHtml(env.certificateAddress)}</a></span>
    </div>
    <div class="detail-row">
      <span class="detail-key">Owner Wallet</span>
      <span class="detail-value"><a href="${escHtml(explorerAddrUrl)}">${escHtml(shortAddress(owner, 10, 8))}</a></span>
    </div>
    ${txHash ? `
    <div class="detail-row">
      <span class="detail-key">Retirement TxHash</span>
      <span class="detail-value"><a href="${escHtml(explorerTxUrl)}">${escHtml(txHash)}</a></span>

    </div>` : ''}
    <div class="detail-row">
      <span class="detail-key">Network</span>
      <span class="detail-value">Avalanche Fuji (Chain ID 43113)</span>
    </div>
    <div class="detail-row">
      <span class="detail-key">Block Explorer</span>
      <span class="detail-value"><a href="${escHtml(pageUrl)}">${escHtml(pageUrl)}</a></span>
    </div>
  </div>

  <!-- PROJECT CONTRIBUTION TABLE -->
  <div class="table-block">
    <h2>Project Contribution Breakdown</h2>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Project Name</th>
          <th>SAL Retired</th>
          <th>CO₂e Offset</th>
        </tr>
      </thead>
      <tbody>
        ${sourceRows}
      </tbody>
    </table>
  </div>

  <!-- QR + DISCLAIMER -->
  <div class="bottom-row">
    <div class="qr-block">
      ${qrPlaceholderSvg(pageUrl)}
      <div class="qr-label">Verify on Snowtrace</div>
      <div class="qr-url">${escHtml(pageUrl)}</div>
    </div>
    <div class="disclaimer">
      <strong>Disclaimer</strong><br/>
      This document is an ESG audit-grade summary generated from on-chain data recorded on the
      Avalanche Fuji C-Chain. The Soul-Bound Token (SBT #${tokenId}) is permanent, non-transferable,
      and publicly verifiable at any time via Snowtrace or the SALX verification page linked above.
      Exchange rates shown elsewhere (AVAX / USDC / VNĐ) are reference values only and do not
      constitute financial advice. CO₂ offset is calculated at 10 kg CO₂e per 1 SAL token retired.
      <br/><br/>
      <strong>Printed:</strong> ${escHtml(printDateStr)}
    </div>
  </div>

  <!-- FOOTER -->
  <div class="footer">
    <span>SALX Carbon Retirement Platform · Powered by Avalanche</span>
    <span>salx.vercel.app · ${escHtml(env.blockExplorerUrl)}</span>
  </div>

</body>
</html>`;

  // ── Open in a hidden iframe so only the certificate is printed ──────────────
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;opacity:0;pointer-events:none;';
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentWindow?.document || iframe.contentDocument;
  if (!iframeDoc) {
    // Fallback: open in a new tab
    const tab = window.open('', '_blank');
    if (tab) {
      tab.document.write(html);
      tab.document.close();
      tab.focus();
      setTimeout(() => tab.print(), 400);
    }
    return;
  }

  iframeDoc.open();
  iframeDoc.write(html);
  iframeDoc.close();

  // Give the iframe time to load fonts / layout, then print and clean up.
  // We trigger print directly after a brief timeout rather than relying solely on onload.
  const triggerPrint = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      window.print();
    } finally {
      setTimeout(() => {
        if (iframe.parentNode) {
          document.body.removeChild(iframe);
        }
      }, 3000);
    }
  };

  setTimeout(triggerPrint, 350);
}
