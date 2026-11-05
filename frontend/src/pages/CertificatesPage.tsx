import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { backend } from '../services/backend';
import { useWallet } from '../contexts/WalletContext';
import type { Certificate, Project, TransactionEvent } from '../types/domain';
import { formatDate, formatNumber, shortAddress } from '../lib/format';
import { env } from '../config/env';
import { WalletButton } from '../components/wallet/WalletButton';
import { CertificateCarousel } from '../components/certificate/CertificateCarousel';
import { useLanguage } from '../contexts/LanguageContext';
import {
  MONO,
  MonoNotice,
  Reveal,
  SectionLabel,
  SectionLink,
  StatCard,
  StatGrid,
  TxTypePill,
} from '../components/dashboard/DashboardKit';

const HISTORY_LIMIT = 10;

// Marketplace purchases are indexed as TRANSFER events with a transferKind.
const txLabel = (tx: TransactionEvent) =>
  tx.transactionType === 'TRANSFER' && tx.metadata?.transferKind === 'MARKETPLACE_PURCHASE'
    ? 'PURCHASE'
    : tx.transactionType;

// Dashboard → Certificates tab. Rendered inside PortfolioPage, which owns the
// page header, tab bar and footer.
export function CertificatesPage() {
  const wallet = useWallet();
  const { t } = useLanguage();
  const [certs, setCerts] = useState<Certificate[]>([]);
  const [txs, setTxs] = useState<TransactionEvent[]>([]);
  const [projectMap, setProjectMap] = useState<Map<number, Project>>(new Map());
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // ?sbt=<tokenId> opens the carousel on that certificate and follows it.
  const requestedSbt = Number(searchParams.get('sbt'));
  const initialIndex = Math.max(0, certs.findIndex(c => c.certificateTokenId === requestedSbt));
  const syncSbtParam = useCallback((index: number) => {
    const tokenId = certs[index]?.certificateTokenId;
    if (tokenId == null) return;
    setSearchParams(prev => {
      if (prev.get('sbt') === String(tokenId)) return prev;
      const next = new URLSearchParams(prev);
      next.set('sbt', String(tokenId));
      return next;
    }, { replace: true });
  }, [certs, setSearchParams]);

  useEffect(() => {
    if (!wallet.address) return;
    setLoading(true);
    setFailed(false);
    // Certs + txs are critical — load together; a failure here is a real error
    Promise.all([
      backend.certificatesByWallet(wallet.address),
      backend.transactions(wallet.address),
    ])
      .then(([certificates, transactions]) => {
        setCerts(certificates);
        setTxs(transactions);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));

    // Projects are non-critical — only needed to enrich CertificateCard with metadata
    backend.projects('approved')
      .then(projects => {
        const map = new Map<number, Project>();
        for (const p of projects) {
          if (p.onChainProjectId != null) map.set(p.onChainProjectId, p);
        }
        setProjectMap(map);
      })
      .catch(() => {}); // Cert display still works without it
  }, [wallet.address]);

  if (!wallet.address) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 14, background: 'var(--surf)', border: '1px solid var(--bd-mid)', borderRadius: 10, padding: '14px 18px', marginBottom: 24 }}>
        <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mut)', letterSpacing: '.06em', flex: 1, minWidth: 200 }}>
          Connect your wallet to see your retirement certificates.
        </span>
        <WalletButton />
      </div>
    );
  }

  const activeCount = certs.filter(c => c.status === 'ACTIVE').length;
  const revokedCount = certs.filter(c => c.status === 'REVOKED').length;
  const retiredKg = certs.filter(c => c.status === 'ACTIVE').reduce((sum, c) => sum + (c.retiredCO2Kg || 0), 0);
  const retiredSal = certs.filter(c => c.status === 'ACTIVE').reduce((sum, c) => sum + (c.retiredTokenAmount || 0), 0);
  const latest = [...certs].sort((a, b) => new Date(b.mintedAt ?? 0).getTime() - new Date(a.mintedAt ?? 0).getTime())[0];
  const latestDate = latest?.mintedAt
    ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(latest.mintedAt))
    : '—';

  return (
    <>
      {/* Stats */}
      <Reveal>
        <StatGrid>
          <StatCard label="SOULBOUND TOKENS" value={loading ? '—' : certs.length} sub="minted to this wallet" />
          <StatCard label="ACTIVE" value={loading ? '—' : activeCount} sub={revokedCount ? `${revokedCount} revoked` : 'none revoked'} />
          <StatCard label="CO₂ RETIRED" value={loading ? '—' : formatNumber(retiredKg)} unit="kg CO₂e" sub={`= ${formatNumber(retiredSal)} SAL burned`} accent />
          <StatCard label="LATEST" value={loading ? '—' : latestDate} sub={latest ? `SBT #${latest.certificateTokenId}` : 'no certificate yet'} />
        </StatGrid>
      </Reveal>

      {/* Certificates */}
      <Reveal delay={40}>
        <div style={{ marginBottom: 26 }}>
          <SectionLabel right={<SectionLink href="/retire">+ RETIRE MORE ↗</SectionLink>}>
            RETIREMENT CERTIFICATES (SBT)
          </SectionLabel>

          {loading ? (
            <div style={{ border: '1px solid var(--bd-mid)', borderRadius: 10 }}><MonoNotice>LOADING…</MonoNotice></div>
          ) : failed ? (
            <div style={{ border: '1px solid rgba(224,82,82,.3)', borderRadius: 10 }}>
              <MonoNotice>Could not load certificates. The backend may be waking up — reload in a minute.</MonoNotice>
            </div>
          ) : certs.length === 0 ? (
            <div style={{ border: '1px solid var(--bd-mid)', borderRadius: 10 }}>
              <MonoNotice>
                NO CERTIFICATES YET<br />
                <span style={{ letterSpacing: '.02em' }}>{t('cert.noneHint')}</span><br />
                <SectionLink href="/retire">RETIRE SAL ↗</SectionLink>
              </MonoNotice>
            </div>
          ) : (
            <CertificateCarousel
              // Remount when the wallet's collection changes so the deep link is applied again.
              key={certs.map(c => c.certificateTokenId).join(',')}
              certificates={certs}
              projects={projectMap}
              initialIndex={initialIndex}
              onIndexChange={syncSbtParam}
            />
          )}
        </div>
      </Reveal>

      {/* Transaction history */}
      <Reveal delay={80}>
        <div style={{ borderTop: '1px solid var(--bd-mid)', paddingTop: 18 }}>
          <SectionLabel right={<SectionLink href="/activity">VIEW ALL ↗</SectionLink>}>
            TRANSACTION HISTORY{txs.length ? ` · ${txs.length}` : ''}
          </SectionLabel>
          <div style={{ border: '1px solid var(--bd-mid)', borderRadius: 10, overflow: 'hidden' }}>
            {loading ? (
              <MonoNotice>LOADING…</MonoNotice>
            ) : txs.length === 0 ? (
              <MonoNotice>NO INDEXED TRANSACTIONS YET</MonoNotice>
            ) : (
              txs.slice(0, HISTORY_LIMIT).map((tx, index, shown) => (
                <div
                  key={`${tx.txHash}-${index}`}
                  style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', alignItems: 'center', gap: 16, padding: '12px 16px', borderBottom: index < shown.length - 1 ? '1px solid var(--bd-mid)' : 'none' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <TxTypePill type={txLabel(tx)} />
                    <a
                      href={`${env.blockExplorerUrl}/tx/${tx.txHash}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontFamily: MONO, fontSize: 10, color: 'var(--ink)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {shortAddress(tx.txHash, 10, 6)} <span style={{ color: 'var(--g)' }}>↗</span>
                    </a>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--ink)' }}>
                      {(tx.amount ?? tx.tokenAmount) != null ? `${formatNumber(Number(tx.amount ?? tx.tokenAmount))} SAL` : '—'}
                      {tx.co2Kg != null && <span style={{ color: 'var(--mut)' }}> · {formatNumber(tx.co2Kg)} kg</span>}
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mut)', marginTop: 2 }}>{formatDate(tx.timestamp)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </Reveal>
    </>
  );
}
