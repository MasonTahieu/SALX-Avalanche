import { useState } from 'react';
import { backend } from '../../services/backend';
import { submitProject } from '../../services/blockchain';
import { useWallet } from '../../contexts/WalletContext';
import { errorMessage } from '../../lib/errors';
import type { UploadedDocument } from './useDocumentUpload';

export interface ProjectFormData {
  projectName: string;
  description: string;
  proposedCO2Kg: string;
  projectType: string;
  carbonStandard: string;
  location: string;
  methodology: string;
  monitoringStart: string;
  monitoringEnd: string;
  image: string;
  externalUrl: string;
}

export const INITIAL_FORM: ProjectFormData = {
  projectName: '',
  description: '',
  proposedCO2Kg: '1000',
  projectType: '',
  carbonStandard: '',
  location: '',
  methodology: '',
  monitoringStart: '',
  monitoringEnd: '',
  image: '',
  externalUrl: '',
};

export interface MetadataResult {
  projectURI: string;
  valueWei: string;
  valueETH: string;
  proposedCO2Kg: number;
}

export interface UseProjectSubmitResult {
  form: ProjectFormData;
  setField: (key: keyof ProjectFormData, value: string) => void;
  metadata: MetadataResult | null;
  txHash: string | null;
  busy: boolean;
  error: string | null;
  clearError: () => void;
  fetchMetadata: (docs: UploadedDocument[]) => Promise<boolean>;
  submitOnChain: () => Promise<boolean>;
}

export function useProjectSubmit(): UseProjectSubmitResult {
  const wallet = useWallet();
  const [form, setForm] = useState<ProjectFormData>(INITIAL_FORM);
  const [metadata, setMetadata] = useState<MetadataResult | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setField = (key: keyof ProjectFormData, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const fetchMetadata = async (docs: UploadedDocument[]): Promise<boolean> => {
    if (!wallet.address) {
      wallet.openWalletModal();
      return false;
    }

    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        ...form,
        proposedCO2Kg: Number(form.proposedCO2Kg),
        ownerWallet: wallet.address,
        documents: docs,
      };
      if (form.monitoringStart) payload.monitoringStart = form.monitoringStart;
      else delete payload.monitoringStart;
      if (form.monitoringEnd) payload.monitoringEnd = form.monitoringEnd;
      else delete payload.monitoringEnd;
      if (form.image) payload.image = form.image;
      else delete payload.image;
      if (form.externalUrl) payload.externalUrl = form.externalUrl;
      else delete payload.externalUrl;
      if (!form.carbonStandard) delete payload.carbonStandard;

      const resp = await backend.createProjectMetadata(payload);
      setMetadata({
        projectURI: resp.projectURI,
        valueWei: resp.nextAction.valueWei,
        valueETH: resp.nextAction.valueETH,
        proposedCO2Kg: Number(form.proposedCO2Kg),
      });
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const submitOnChain = async (): Promise<boolean> => {
    if (!metadata) {
      setError('Project metadata is missing. Please go back and regenerate it.');
      return false;
    }
    if (!wallet.address) {
      wallet.openWalletModal();
      return false;
    }

    setBusy(true);
    setError(null);
    try {
      const tx = await submitProject(metadata.projectURI, metadata.proposedCO2Kg, metadata.valueWei);
      setTxHash(tx.txHash);
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  return {
    form,
    setField,
    metadata,
    txHash,
    busy,
    error,
    clearError: () => setError(null),
    fetchMetadata,
    submitOnChain,
  };
}
