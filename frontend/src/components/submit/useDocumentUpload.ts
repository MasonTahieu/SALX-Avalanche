import { useState } from 'react';
import { uploadDocumentToIPFS } from '../../services/backend';
import { errorMessage } from '../../lib/errors';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_FILE_COUNT = 20;

export interface UploadedDocument {
  name: string;
  uri: string;
}

export type FileStatus = 'pending' | 'uploading' | 'done' | 'error';

export interface FileEntry {
  file: File;
  status: FileStatus;
  uri?: string;
  error?: string;
}

export interface UseDocumentUploadResult {
  entries: FileEntry[];
  addFiles: (fileList: FileList | File[] | null) => void;
  removeFile: (index: number) => void;
  // O(n) sequential upload; returns successfully uploaded docs
  uploadAll: () => Promise<UploadedDocument[]>;
  isUploading: boolean;
  oversizedFileNames: string[];
}

export function useDocumentUpload(): UseDocumentUploadResult {
  const [entries, setEntries] = useState<FileEntry[]>([]);

  const addFiles = (fileList: FileList | File[] | null) => {
    if (!fileList) return;
    const incoming = Array.from(fileList);
    setEntries(prev => {
      const next = [...prev];
      for (const file of incoming) {
        if (next.length >= MAX_FILE_COUNT) break;
        const isDuplicate = next.some(e => e.file.name === file.name && e.file.size === file.size);
        if (!isDuplicate) next.push({ file, status: 'pending' });
      }
      return next;
    });
  };

  const removeFile = (index: number) => {
    setEntries(prev => prev.filter((_, i) => i !== index));
  };

  const uploadAll = async (snapshot = entries): Promise<UploadedDocument[]> => {
    const results: UploadedDocument[] = [];
    for (let i = 0; i < snapshot.length; i++) {
      const entry = snapshot[i];

      if (entry.status === 'done' && entry.uri) {
        results.push({ name: entry.file.name, uri: entry.uri });
        continue;
      }

      if (entry.file.size > MAX_FILE_SIZE_BYTES) {
        setEntries(prev => prev.map((e, j) =>
          j === i ? { ...e, status: 'error', error: 'Exceeds 5 MB limit' } : e,
        ));
        continue;
      }

      setEntries(prev => prev.map((e, j) =>
        j === i ? { ...e, status: 'uploading', error: undefined } : e,
      ));

      try {
        const res = await uploadDocumentToIPFS(entry.file);
        const uri = `ipfs://${res.ipfsHash}`;
        setEntries(prev => prev.map((e, j) => j === i ? { ...e, status: 'done', uri } : e));
        results.push({ name: entry.file.name, uri });
      } catch (err) {
        setEntries(prev => prev.map((e, j) =>
          j === i ? { ...e, status: 'error', error: errorMessage(err) } : e,
        ));
      }
    }
    return results;
  };

  const isUploading = entries.some(e => e.status === 'uploading');
  const oversizedFileNames = entries
    .filter(e => e.file.size > MAX_FILE_SIZE_BYTES)
    .map(e => e.file.name);

  return { entries, addFiles, removeFile, uploadAll: () => uploadAll(entries), isUploading, oversizedFileNames };
}
