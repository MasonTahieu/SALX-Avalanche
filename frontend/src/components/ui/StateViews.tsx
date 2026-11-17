import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';

export function LoadingSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))', gap: 16 }}>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          aria-hidden="true"
          style={{
            borderRadius: 16,
            border: '1px solid var(--bd)',
            background: 'var(--surf)',
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div className="market-dc-skeleton-cover" />
          <div className="market-dc-skeleton-line" style={{ width: '72%' }} />
          <div className="market-dc-skeleton-line" style={{ width: '48%' }} />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '44px 24px',
        borderRadius: 16,
        border: '1px dashed var(--bd2)',
        background: 'var(--surf)',
        gap: 10,
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          display: 'grid',
          placeItems: 'center',
          background: 'var(--gb)',
          color: 'var(--g-text)',
          border: '1px solid var(--gd)',
        }}
      >
        <Inbox size={20} />
      </div>
      <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--ink)' }}>{title}</h3>
      <p style={{ margin: 0, maxWidth: 420, fontSize: 14, color: 'var(--mut)' }}>{description}</p>
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}

export function ErrorState({
  title,
  description,
  onRetry,
  retryLabel = 'Retry',
}: {
  title: string;
  description: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '40px 24px',
        borderRadius: 16,
        border: '1px solid var(--avax-bd)',
        background: 'var(--avax-bg)',
        gap: 10,
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          display: 'grid',
          placeItems: 'center',
          background: 'var(--surf)',
          color: 'var(--avax)',
          border: '1px solid var(--avax-bd)',
        }}
      >
        <AlertTriangle size={20} />
      </div>
      <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--ink)' }}>{title}</h3>
      <p style={{ margin: 0, maxWidth: 460, fontSize: 14, color: 'var(--mut)' }}>{description}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          style={{
            marginTop: 8,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 16px',
            borderRadius: 10,
            border: '1px solid var(--bd2)',
            background: 'var(--surf)',
            color: 'var(--ink)',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <RefreshCw size={14} />
          {retryLabel}
        </button>
      )}
    </div>
  );
}
