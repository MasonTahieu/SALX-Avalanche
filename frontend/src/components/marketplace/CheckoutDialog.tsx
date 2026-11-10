import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import type { Listing, Project } from '../../types/domain';
import { env } from '../../config/env';
import { useWallet } from '../../contexts/WalletContext';
import { formatCO2 } from '../../lib/format';
import { certificateFromReceipt } from '../../lib/mintedCertificate';
import { projectDisplay } from '../../lib/projectMeta';
import { TEST_AVAX_FAUCET_URL } from '../../lib/walletFunding';
import { CertificateCard } from '../certificate/CertificateCard';
import { useCheckoutFlow, type CheckoutStepStatus } from './useCheckoutFlow';
import './CheckoutDialog.css';

export interface CheckoutDialogProps {
  listing: Listing;
  project?: Project;
  amount: number;
  onClose: () => void;
  /** Called once the purchase is on-chain, e.g. to refresh the listings. */
  onPurchased?: () => void;
}

/** Six significant digits are plenty for testnet prices and fees. */
const formatNative = (value: number) => `${Number(value.toPrecision(6))} ${env.nativeSymbol}`;

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

const STATUS_TEXT: Record<CheckoutStepStatus, string> = {
  waiting: 'not started',
  active: 'in progress',
  done: 'done',
  skipped: 'not needed',
  failed: 'failed',
};

function StepIcon({ n, status }: { n: number; status: CheckoutStepStatus }) {
  const symbol = status === 'done' ? '✓' : status === 'failed' ? '!' : status === 'skipped' ? '–' : status === 'active' ? null : n;
  return (
    <span className={`checkout-step__icon is-${status}`} aria-hidden="true">
      {symbol ?? <span className="checkout-step__spinner" />}
    </span>
  );
}

function Step({ n, status, label, hint }: { n: number; status: CheckoutStepStatus; label: string; hint?: ReactNode }) {
  return (
    <li className={`checkout-step is-${status}`}>
      <StepIcon n={n} status={status} />
      <div>
        <span className="checkout-step__label">
          {label}
          <span className="sr-only"> ({STATUS_TEXT[status]})</span>
        </span>
        {hint && <span className="checkout-step__hint">{hint}</span>}
      </div>
    </li>
  );
}

function TxLink({ hash }: { hash: string | null }) {
  if (!hash) return null;
  return <a href={`${env.blockExplorerUrl}/tx/${hash}`} target="_blank" rel="noreferrer">View transaction ↗</a>;
}

/**
 * Buy SAL and get the retirement certificate in one place, instead of buying
 * here and retiring on another page. Unticking "Retire now" only buys.
 *
 * Rendered as a plain overlay rather than a modal <dialog>: the wallet dialog
 * and Privy's confirmation screens open on top of it mid-flow, and a modal
 * dialog would cover them and make them unclickable.
 */
export function CheckoutDialog({ listing, project, amount, onClose, onPurchased }: CheckoutDialogProps) {
  const wallet = useWallet();
  const [retireNow, setRetireNow] = useState(true);
  const flow = useCheckoutFlow({ listing, amount, retireNow, onPurchased });
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const optionId = useId();

  const details = projectDisplay(project);
  const projectName = project?.projectName || `SAL Project #${listing.projectId}`;
  const metaText = [details.projectType, details.location].filter(Boolean).join(' · ');

  const unitPrice = Number(listing.pricePerUnitETH);
  const priceTotal = unitPrice * amount;
  const fee = flow.certificateFeeETH != null ? Number(flow.certificateFeeETH) : null;
  const total = retireNow ? (fee != null ? priceTotal + fee : null) : priceTotal;
  const kg = amount * flow.kgPerSAL;
  const balance = wallet.address && wallet.nativeBalance != null ? Number(wallet.nativeBalance) : null;
  const shortfall = !flow.started && balance != null && total != null && balance < total;
  const awaitingCertificate = retireNow && flow.retireTxHash !== null && !flow.certificate;

  const close = () => {
    // A wallet prompt or transaction is in progress; closing now would hide it.
    if (!flow.busy) onClose();
  };

  // Use the current balance for the funds check below.
  const { address, refreshBalance } = wallet;
  useEffect(() => {
    if (address) void refreshBalance();
  }, [address, refreshBalance]);

  // While the wallet dialog is open on top, this one is inert, so Tab and Esc
  // reach the wallet dialog; focus comes back here when it closes.
  const walletDialogOpen = wallet.modalOpen;
  const walletDialogWasOpen = useRef(false);
  useEffect(() => {
    if (walletDialogOpen) {
      walletDialogWasOpen.current = true;
    } else if (walletDialogWasOpen.current) {
      walletDialogWasOpen.current = false;
      panelRef.current?.focus();
    }
  }, [walletDialogOpen]);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    // Keep keyboard focus inside the dialog.
    const panel = panelRef.current;
    if (!panel) return;
    const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const approveStatus: CheckoutStepStatus =
    flow.steps.approve === 'waiting' && flow.approvalNeeded === false ? 'skipped' : flow.steps.approve;

  const buyHint = flow.steps.buy === 'active'
    ? 'Confirm in your wallet, then wait a few seconds'
    : flow.steps.buy === 'done' ? <TxLink hash={flow.buyTxHash} /> : formatNative(priceTotal);
  const approveHint = approveStatus === 'active'
    ? 'Confirm in your wallet'
    : approveStatus === 'done' ? 'Allowed'
      : approveStatus === 'skipped' ? 'Already allowed, nothing to confirm'
        : 'First time only: lets the marketplace burn the SAL you retire';
  const retireHint = flow.steps.retire === 'active'
    ? 'Preparing the certificate, then confirm in your wallet'
    : flow.steps.retire === 'done' ? <TxLink hash={flow.retireTxHash} />
      : `${formatCO2(kg)}${fee != null ? ` · fee ${formatNative(fee)}` : ''}`;
  const certificateHint = flow.steps.certificate === 'active'
    ? 'Recording your certificate, usually a few seconds'
    : flow.steps.certificate === 'done' ? 'Ready' : undefined;

  const confirmations = !retireNow
    ? 'You will confirm 1 transaction in your wallet.'
    : flow.approvalNeeded === false
      ? 'You will confirm 2 transactions in your wallet.'
      : flow.approvalNeeded === true
        ? 'You will confirm 3 transactions in your wallet. Allowing retirement is needed only this first time.'
        : 'You will confirm 2 transactions in your wallet, or 3 the first time.';

  const primaryLabel = !wallet.address
    ? 'Connect wallet to continue'
    : flow.busy ? 'Processing…'
      : awaitingCertificate ? 'Recording certificate…'
        : flow.error ? 'Try again'
          : retireNow ? 'Confirm and get certificate' : 'Confirm purchase';

  // The receipt already names the new SBT, so the result shows as soon as the
  // retirement is confirmed; the artwork follows once the backend records it.
  const receiptCertificate = useMemo(
    () => (flow.minted ? certificateFromReceipt(flow.minted, projectName) : null),
    [flow.minted, projectName],
  );
  const certificate = flow.certificate ?? receiptCertificate;

  const dialog = (
    <div
      className="checkout"
      inert={walletDialogOpen}
      onClick={event => { if (event.target === event.currentTarget) close(); }}
    >
      <div
        ref={panelRef}
        className={`checkout__panel${certificate ? ' checkout__panel--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <button type="button" className="checkout__close" onClick={close} disabled={flow.busy} aria-label="Close">✕</button>

        {certificate ? (
          <>
            <p className="checkout__eyebrow">Certificate minted</p>
            <h2 id={titleId} className="checkout__title">
              Retired {certificate.retiredTokenAmount} SAL · {formatCO2(certificate.retiredCO2Kg)}
            </h2>
            <p className="checkout__meta">{projectName} · certificate SBT #{certificate.certificateTokenId} is in your wallet</p>
            <hr className="checkout__rule" />
            <CertificateCard certificate={certificate} project={project} eager preparing={!flow.certificate} />
            <div className="checkout__actions">
              <Link to="/dashboard?tab=certificates" className="checkout__secondary">View all certificates</Link>
              <button type="button" className="checkout__primary" onClick={onClose}>Done</button>
            </div>
          </>
        ) : (
          <>
            <p className="checkout__eyebrow">{retireNow ? 'Buy & retire' : 'Buy SAL'}</p>
            <h2 id={titleId} className="checkout__title">{projectName}</h2>
            {metaText && <p className="checkout__meta">{metaText}</p>}
            <hr className="checkout__rule" />

            <dl className="checkout__summary">
              <div className="checkout__row"><dt>Quantity</dt><dd>{amount} SAL</dd></div>
              <div className="checkout__row"><dt>Climate impact</dt><dd>{formatCO2(kg)}</dd></div>
              <div className="checkout__row">
                <dt>Price</dt>
                <dd>{amount} × {formatNative(unitPrice)} = {formatNative(priceTotal)}</dd>
              </div>
              {retireNow && (
                <div className="checkout__row"><dt>Certificate fee</dt><dd>{fee != null ? formatNative(fee) : '…'}</dd></div>
              )}
              <div className="checkout__row checkout__row--total">
                <dt>Total</dt><dd>{total != null ? formatNative(total) : '…'}</dd>
              </div>
            </dl>
            <p className="checkout__fine">Plus a small network fee.</p>

            <label className={`checkout__option${flow.started ? ' is-locked' : ''}`}>
              <input
                type="checkbox"
                checked={retireNow}
                disabled={flow.started}
                onChange={event => setRetireNow(event.target.checked)}
                aria-labelledby={`${optionId}-label`}
                aria-describedby={`${optionId}-hint`}
              />
              <span>
                <strong id={`${optionId}-label`}>Retire now and get my certificate</strong>
                <span id={`${optionId}-hint`} className="checkout__option-hint">
                  Burns the SAL for good and mints a certificate (SBT) to your wallet. Untick to only buy and retire later.
                </span>
              </span>
            </label>

            <ol className="checkout__steps" aria-label="Progress" aria-live="polite">
              <Step n={1} status={flow.steps.buy} label={`Buy ${amount} SAL`} hint={buyHint} />
              {retireNow && (
                <>
                  <Step n={2} status={approveStatus} label="Allow retirement" hint={approveHint} />
                  <Step n={3} status={flow.steps.retire} label="Retire and mint certificate" hint={retireHint} />
                  <Step n={4} status={flow.steps.certificate} label="Certificate ready" hint={certificateHint} />
                </>
              )}
            </ol>

            {shortfall && balance != null && total != null && (
              <p className="checkout__alert">
                Your wallet has {formatNative(balance)}, but this needs {formatNative(total)} plus a small network fee.{' '}
                <a href={TEST_AVAX_FAUCET_URL} target="_blank" rel="noreferrer">Get test {env.nativeSymbol} ↗</a>
              </p>
            )}

            {flow.error && (
              <p className="checkout__alert" role="alert">
                {flow.error}
                {retireNow && flow.bought && (
                  <> Your {amount} SAL is in your wallet. Try again, or retire it later on the <Link to="/retire">Retire page</Link>.</>
                )}
              </p>
            )}

            {flow.finished ? (
              <>
                <p className="checkout__done">
                  You now hold {amount} SAL ({formatCO2(kg)}). Retire it on the <Link to="/retire">Retire page</Link> whenever you want a certificate.
                </p>
                <button type="button" className="checkout__primary" onClick={onClose}>Done</button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="checkout__primary"
                  onClick={() => { void flow.run(); }}
                  disabled={flow.busy || shortfall || awaitingCertificate}
                >
                  {primaryLabel}
                </button>
                {!flow.started && <p className="checkout__hint">{confirmations}</p>}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
