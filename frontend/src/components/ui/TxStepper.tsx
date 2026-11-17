import { Check, ExternalLink, Loader2 } from 'lucide-react';
import { env } from '../../config/env';

export type TxStepState = 'approve' | 'sign' | 'confirming' | 'success';

interface TxStepperProps {
  currentStep: TxStepState;
  txHash?: string | null;
  labels?: {
    approve: string;
    sign: string;
    confirming: string;
    success: string;
  };
  explorerLabel?: string;
}

const DEFAULT_LABELS = {
  approve: 'Approve',
  sign: 'Sign',
  confirming: 'Confirming',
  success: 'Success',
};

const STEPS: TxStepState[] = ['approve', 'sign', 'confirming', 'success'];

export function TxStepper({
  currentStep,
  txHash,
  labels = DEFAULT_LABELS,
  explorerLabel = 'Snowtrace',
}: TxStepperProps) {
  const activeIdx = STEPS.indexOf(currentStep);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 16,
        borderRadius: 16,
        border: '1px solid var(--bd)',
        background: 'var(--surf2)',
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
        {STEPS.map((step, idx) => {
          const done = idx < activeIdx || (currentStep === 'success' && idx === activeIdx);
          const active = idx === activeIdx && currentStep !== 'success';
          return (
            <div key={step} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center' }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  fontWeight: 700,
                  background: done ? 'var(--g)' : active ? 'var(--gb)' : 'var(--surf)',
                  color: done ? '#04110f' : active ? 'var(--g-text)' : 'var(--mut)',
                  border: `1px solid ${done || active ? 'var(--g)' : 'var(--bd)'}`,
                }}
              >
                {done ? <Check size={14} /> : active ? <Loader2 size={14} className="animate-spin" /> : idx + 1}
              </div>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  fontWeight: done || active ? 600 : 400,
                  color: done || active ? 'var(--ink)' : 'var(--mut)',
                }}
              >
                {labels[step]}
              </span>
            </div>
          );
        })}
      </div>

      {txHash && (
        <a
          href={`${env.blockExplorerUrl}/tx/${txHash}`}
          target="_blank"
          rel="noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--avax)',
            paddingTop: 6,
            borderTop: '1px solid var(--bd-soft)',
          }}
        >
          <span>{explorerLabel}: {txHash.slice(0, 10)}…{txHash.slice(-6)}</span>
          <ExternalLink size={13} />
        </a>
      )}
    </div>
  );
}
