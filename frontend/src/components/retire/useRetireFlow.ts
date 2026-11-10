import { useCallback, useEffect, useMemo, useState } from 'react';
import { backend } from '../../services/backend';
import { retireSAL, retirementConfig, salBalance } from '../../services/blockchain';
import { useWallet } from '../../contexts/WalletContext';
import type { Certificate, MintedCertificate, Project } from '../../types/domain';
import { product } from '../../config/product';
import { errorMessage } from '../../lib/errors';

export interface HoldingRow {
  project: Project;
  balance: number;
}

export interface RetireConfig {
  maxProjects: number;
  kgPerSAL: number;
  feeETH: string;
}

// Discriminated union — makes the phase explicit and type-safe
export type CertState =
  | { phase: 'idle' }
  | { phase: 'pending'; txHash: string }
  | { phase: 'found'; certificate: Certificate; txHash: string };

const DEFAULT_CONFIG: RetireConfig = {
  maxProjects: product.fallbackMaxRetirementProjects,
  kgPerSAL: product.fallbackKgPerSAL,
  feeETH: '—',
};

function isCertificate(resp: Certificate | { status: 'PENDING' }): resp is Certificate {
  return 'certificateTokenId' in resp;
}

export interface UseRetireFlowResult {
  holdings: HoldingRow[];
  loadingHoldings: boolean;
  config: RetireConfig;
  selection: Record<number, number>;
  selectedRows: HoldingRow[];
  totalSAL: number;
  invalidAmount: boolean;
  busy: boolean;
  error: string | null;
  clearError: () => void;
  certState: CertState;
  /** The SBT as the retirement receipt reports it, shown until the backend has recorded it. */
  minted: MintedCertificate | null;
  toggleSource: (row: HoldingRow) => void;
  setAmount: (projectId: number, amount: number) => void;
  run: () => Promise<void>;
  reloadCertificate: () => Promise<void>;
  resetAfterRetirement: () => void;
}

export function useRetireFlow(): UseRetireFlowResult {
  const wallet = useWallet();
  const [holdings, setHoldings] = useState<HoldingRow[]>([]);
  const [loadingHoldings, setLoadingHoldings] = useState(false);
  const [config, setConfig] = useState<RetireConfig>(DEFAULT_CONFIG);
  const [selection, setSelection] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [certState, setCertState] = useState<CertState>({ phase: 'idle' });
  const [minted, setMinted] = useState<MintedCertificate | null>(null);

  // O(n) parallel balance fetches — one network round-trip per project
  const loadHoldings = useCallback(async () => {
    if (!wallet.address) return;
    setLoadingHoldings(true);
    try {
      const [projects, cfg] = await Promise.all([
        backend.projects('approved'),
        retirementConfig(),
      ]);
      setConfig({
        maxProjects: cfg.maxProjects || product.fallbackMaxRetirementProjects,
        kgPerSAL: cfg.kgPerSAL || product.fallbackKgPerSAL,
        feeETH: cfg.certificateFeeETH,
      });
      const eligible = projects.filter(p => p.onChainProjectId != null && !p.blacklisted);
      const rows = await Promise.all(
        eligible.map(async project => ({
          project,
          balance: await salBalance(wallet.address!, project.onChainProjectId!),
        })),
      );
      setHoldings(rows.filter(r => r.balance > 0));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoadingHoldings(false);
    }
  }, [wallet.address]);

  useEffect(() => { loadHoldings(); }, [loadHoldings]);

  const selectedRows = useMemo(
    () => holdings.filter(r => {
      const id = r.project.onChainProjectId;
      return id != null && (selection[id] ?? 0) > 0;
    }),
    [holdings, selection],
  );

  const totalSAL = useMemo(
    () => selectedRows.reduce((sum, r) => sum + (selection[r.project.onChainProjectId!] ?? 0), 0),
    [selectedRows, selection],
  );

  const invalidAmount = selectedRows.some(r => {
    const amount = selection[r.project.onChainProjectId!] ?? 0;
    return amount <= 0 || amount > r.balance;
  });

  const toggleSource = useCallback((row: HoldingRow) => {
    const id = row.project.onChainProjectId!;
    setError(null);
    setSelection(prev => {
      if ((prev[id] ?? 0) > 0) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      const activeCount = Object.values(prev).filter(a => a > 0).length;
      if (activeCount >= config.maxProjects) return prev; // caller checks disabled prop
      return { ...prev, [id]: 1 };
    });
  }, [config.maxProjects]);

  const setAmount = useCallback((projectId: number, amount: number) => {
    setSelection(prev => ({ ...prev, [projectId]: amount }));
  }, []);

  const fetchCertAfterTx = useCallback(async (txHash: string) => {
    try {
      const resp = await backend.certificateByTx(txHash);
      if (isCertificate(resp)) {
        setCertState({ phase: 'found', certificate: resp, txHash });
      } else {
        setCertState({ phase: 'pending', txHash });
      }
    } catch {
      // Cert not indexed yet — treat as pending
      setCertState({ phase: 'pending', txHash });
    }
  }, []);

  const reloadCertificate = useCallback(async () => {
    const txHash = certState.phase !== 'idle' ? certState.txHash : null;
    if (!txHash) return;
    await fetchCertAfterTx(txHash);
  }, [certState, fetchCertAfterTx]);

  // Auto-poll every 2 s while the certificate is being indexed.
  // Stops as soon as the backend returns the certificate or the component unmounts.
  useEffect(() => {
    if (certState.phase !== 'pending') return;
    const id = setInterval(() => fetchCertAfterTx(certState.txHash), 2000);
    return () => clearInterval(id);
  }, [certState, fetchCertAfterTx]);

  const run = useCallback(async () => {
    if (!wallet.address || selectedRows.length === 0 || invalidAmount) return;
    setBusy(true);
    setError(null);
    try {
      const projectIds = selectedRows.map(r => r.project.onChainProjectId!);
      const salAmounts = selectedRows.map(r => selection[r.project.onChainProjectId!]);

      const draft = await backend.createCertificateMetadata({
        ownerAddress: wallet.address,
        projectIds,
        salAmounts,
      });

      const tx = await retireSAL(
        wallet.address,
        projectIds,
        salAmounts,
        draft.certificateURI,
        draft.authorization.deadline,
        draft.authorization.signature,
      );

      setSelection({});
      setMinted(tx.minted ?? null);
      // Update cert state immediately after the tx so the UI transitions without
      // waiting for the holdings refresh (which makes several sequential RPC calls)
      await fetchCertAfterTx(tx.txHash);
      loadHoldings().catch(() => {}); // Refresh holdings in background; never blocks cert display
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }, [wallet.address, selectedRows, invalidAmount, selection, loadHoldings, fetchCertAfterTx]);

  const resetAfterRetirement = useCallback(() => {
    setSelection({});
    setCertState({ phase: 'idle' });
    setMinted(null);
    setError(null);
  }, []);

  return {
    holdings,
    loadingHoldings,
    config,
    selection,
    selectedRows,
    totalSAL,
    invalidAmount,
    busy,
    error,
    clearError: () => setError(null),
    certState,
    minted,
    toggleSource,
    setAmount,
    run,
    reloadCertificate,
    resetAfterRetirement,
  };
}
