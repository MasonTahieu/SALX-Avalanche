import { useCallback, useEffect, useRef, useState } from 'react';
import type { Certificate, CertificateMetadataResponse, Listing, MintedCertificate } from '../../types/domain';
import { backend } from '../../services/backend';
import { ApiError } from '../../services/api';
import {
  buySAL,
  ensureMarketplaceApproval,
  isMarketplaceApproved,
  retireSAL,
  retirementConfig,
} from '../../services/blockchain';
import { useWallet } from '../../contexts/WalletContext';
import { errorMessage } from '../../lib/errors';
import { product } from '../../config/product';

export type CheckoutStep = 'buy' | 'approve' | 'retire' | 'certificate';
export type CheckoutStepStatus = 'waiting' | 'active' | 'done' | 'skipped' | 'failed';
export type CheckoutSteps = Record<CheckoutStep, CheckoutStepStatus>;

const NOT_STARTED: CheckoutSteps = { buy: 'waiting', approve: 'waiting', retire: 'waiting', certificate: 'waiting' };

// Right after the purchase, the backend checks the SAL balance on its own RPC
// node, which can still be a block behind the wallet's. A few short retries
// cover that gap instead of failing the retirement.
export const DRAFT_ATTEMPTS = 5;
export const DRAFT_RETRY_MS = 1500;
export const CERTIFICATE_POLL_MS = 2000;

const isBalanceLag = (error: unknown) =>
  error instanceof ApiError && error.status === 400 && /không đủ SAL/i.test(error.message);

const delay = (ms: number) => new Promise<void>(resolve => { window.setTimeout(resolve, ms); });

async function createCertificateDraft(owner: string, projectId: number, amount: number): Promise<CertificateMetadataResponse> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await backend.createCertificateMetadata({ ownerAddress: owner, projectIds: [projectId], salAmounts: [amount] });
    } catch (error) {
      if (attempt >= DRAFT_ATTEMPTS || !isBalanceLag(error)) throw error;
      await delay(DRAFT_RETRY_MS);
    }
  }
}

const isCertificate = (value: Certificate | { status: 'PENDING' }): value is Certificate =>
  'certificateTokenId' in value;

export interface CheckoutOptions {
  listing: Listing;
  amount: number;
  /** Retire straight after buying and mint the certificate; false only buys. */
  retireNow: boolean;
  /** Called once the purchase is on-chain, e.g. to refresh the listings. */
  onPurchased?: () => void;
}

export interface CheckoutFlow {
  steps: CheckoutSteps;
  busy: boolean;
  error: string | null;
  /** True once the first step has begun; the options are fixed from then on. */
  started: boolean;
  bought: boolean;
  /** Buy only: the purchase is done. Retire: the certificate is recorded. */
  finished: boolean;
  buyTxHash: string | null;
  retireTxHash: string | null;
  /** The SBT as the retirement receipt reports it, known before the backend has recorded it. */
  minted: MintedCertificate | null;
  /** The certificate as the backend recorded it, with its artwork. */
  certificate: Certificate | null;
  kgPerSAL: number;
  /** Certificate fee read from the contract; null until it has loaded. */
  certificateFeeETH: string | null;
  /** Whether this wallet still has to allow retirement; null while unknown. */
  approvalNeeded: boolean | null;
  run: () => Promise<void>;
}

/**
 * Buys SAL from a listing and, unless only buying, retires it at once:
 * buy → allow retirement (first time only) → retire and mint the SBT → wait
 * for the backend to record the certificate. A failed step can be retried
 * without repeating the steps already on-chain.
 */
export function useCheckoutFlow({ listing, amount, retireNow, onPurchased }: CheckoutOptions): CheckoutFlow {
  const wallet = useWallet();
  const [steps, setSteps] = useState<CheckoutSteps>(NOT_STARTED);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [buyTxHash, setBuyTxHash] = useState<string | null>(null);
  const [retireTxHash, setRetireTxHash] = useState<string | null>(null);
  const [minted, setMinted] = useState<MintedCertificate | null>(null);
  const [certificate, setCertificate] = useState<Certificate | null>(null);
  const [kgPerSAL, setKgPerSAL] = useState<number>(product.fallbackKgPerSAL);
  const [certificateFeeETH, setCertificateFeeETH] = useState<string | null>(null);
  const [approvalNeeded, setApprovalNeeded] = useState<boolean | null>(null);

  // What is already on-chain outlives a failed step, so trying again never
  // buys or retires twice.
  const completed = useRef<{ bought: boolean; approved: boolean; retireTx: string | null }>({
    bought: false,
    approved: false,
    retireTx: null,
  });
  const running = useRef(false);
  const resumeAfterConnect = useRef(false);

  const mark = useCallback((step: CheckoutStep, status: CheckoutStepStatus) => {
    setSteps(previous => ({ ...previous, [step]: status }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    retirementConfig()
      .then(config => {
        if (cancelled) return;
        if (config.kgPerSAL > 0) setKgPerSAL(config.kgPerSAL);
        setCertificateFeeETH(config.certificateFeeETH);
      })
      .catch(() => { /* The fee is read again when retiring. */ });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const owner = wallet.address;
    if (!owner) {
      setApprovalNeeded(null);
      return;
    }
    let cancelled = false;
    isMarketplaceApproved(owner)
      .then(approved => { if (!cancelled) setApprovalNeeded(!approved); })
      .catch(() => { if (!cancelled) setApprovalNeeded(null); });
    return () => { cancelled = true; };
  }, [wallet.address]);

  const checkCertificate = useCallback(async (txHash: string) => {
    try {
      const response = await backend.certificateByTx(txHash);
      if (!isCertificate(response)) return;
      setCertificate(response);
      mark('certificate', 'done');
    } catch {
      // Not recorded yet; the poll below asks again.
    }
  }, [mark]);

  // The backend usually records the certificate within seconds of the
  // retirement; keep asking until it has.
  useEffect(() => {
    if (!retireTxHash || certificate) return;
    const timer = window.setInterval(() => { void checkCertificate(retireTxHash); }, CERTIFICATE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [retireTxHash, certificate, checkCertificate]);

  const run = async () => {
    if (running.current) return;
    const owner = wallet.address;
    if (!owner) {
      resumeAfterConnect.current = true;
      wallet.openWalletModal();
      return;
    }

    running.current = true;
    setBusy(true);
    setError(null);
    let step: CheckoutStep = 'buy';
    try {
      if (!completed.current.bought) {
        mark('buy', 'active');
        const purchase = await buySAL(listing.listingId, amount, listing.pricePerUnitWei);
        completed.current.bought = true;
        setBuyTxHash(purchase.txHash);
        mark('buy', 'done');
        onPurchased?.();
      }
      if (!retireNow) return;

      if (!completed.current.approved) {
        step = 'approve';
        mark('approve', 'active');
        const approval = await ensureMarketplaceApproval(owner);
        completed.current.approved = true;
        setApprovalNeeded(false);
        mark('approve', approval ? 'done' : 'skipped');
      }

      let txHash = completed.current.retireTx;
      if (!txHash) {
        step = 'retire';
        mark('retire', 'active');
        const draft = await createCertificateDraft(owner, listing.projectId, amount);
        const retirement = await retireSAL(
          owner,
          [listing.projectId],
          [amount],
          draft.certificateURI,
          draft.authorization.deadline,
          draft.authorization.signature,
        );
        txHash = retirement.txHash;
        completed.current.retireTx = txHash;
        setRetireTxHash(txHash);
        setMinted(retirement.minted);
        mark('retire', 'done');
      }

      step = 'certificate';
      mark('certificate', 'active');
      await checkCertificate(txHash);
    } catch (err) {
      mark(step, 'failed');
      setError(errorMessage(err));
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  // Carry on once the wallet dialog closes with a connected wallet. Closing it
  // without connecting drops the request.
  useEffect(() => {
    if (!resumeAfterConnect.current || wallet.modalOpen) return;
    resumeAfterConnect.current = false;
    if (wallet.address) void run();
    // Only a change in the wallet state should trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.address, wallet.modalOpen]);

  const bought = buyTxHash !== null;
  return {
    steps,
    busy,
    error,
    started: Object.values(steps).some(status => status !== 'waiting'),
    bought,
    finished: retireNow ? certificate !== null : bought,
    buyTxHash,
    retireTxHash,
    minted,
    certificate,
    kgPerSAL,
    certificateFeeETH,
    approvalNeeded,
    run,
  };
}
