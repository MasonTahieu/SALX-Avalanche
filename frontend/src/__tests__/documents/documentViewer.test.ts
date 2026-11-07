import { describe, expect, it } from 'vitest';
import { documentKind, ipfsPath } from '../../components/documents/documentKind';
import { toViewerDocuments } from '../../components/documents/LazyDocumentViewer';

describe('documentKind', () => {
  it('trusts the gateway Content-Type first', () => {
    expect(documentKind('application/pdf', 'report')).toBe('pdf');
    expect(documentKind('text/plain; charset=utf-8', 'MRV report')).toBe('text');
    expect(documentKind('image/png', 'site.bin')).toBe('image');
  });

  it('falls back to the declared type, then the file name', () => {
    expect(documentKind('application/octet-stream', 'x', 'application/pdf')).toBe('pdf');
    expect(documentKind(null, 'plot-photo.JPG')).toBe('image');
    expect(documentKind(undefined, 'readings.csv')).toBe('text');
    expect(documentKind('', 'mrv-period-1.pdf')).toBe('pdf');
  });

  it('never previews HTML or unknown files inline', () => {
    expect(documentKind('text/html', 'page.html')).toBe('other');
    expect(documentKind('application/zip', 'evidence.zip')).toBe('other');
  });
});

describe('toViewerDocuments', () => {
  it('keeps objects with a URI and accepts bare URIs', () => {
    expect(toViewerDocuments([
      { name: 'mrv.pdf', uri: 'ipfs://Qm1', type: 'application/pdf' },
      'ipfs://Qm2',
      { name: 'no uri' },
      null,
      '',
    ])).toEqual([
      { name: 'mrv.pdf', uri: 'ipfs://Qm1', type: 'application/pdf' },
      { uri: 'ipfs://Qm2' },
    ]);
  });

  it('returns an empty list for missing metadata', () => {
    expect(toViewerDocuments(undefined)).toEqual([]);
    expect(toViewerDocuments({})).toEqual([]);
  });
});

describe('ipfsPath', () => {
  it('strips the ipfs:// scheme', () => {
    expect(ipfsPath('ipfs://QmABC/file.pdf')).toBe('QmABC/file.pdf');
    expect(ipfsPath('ipfs://ipfs/QmABC')).toBe('QmABC');
    expect(ipfsPath('QmABC')).toBe('QmABC');
  });
});
