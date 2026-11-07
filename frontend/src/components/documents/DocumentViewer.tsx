import { useEffect, useRef, useState } from 'react';
import { ipfsToHttp } from '../../lib/projectMeta';
import { documentKind, ipfsPath, type DocumentKind } from './documentKind';
import { renderPdf } from './renderPdf';
import './DocumentViewer.css';

export interface ViewerDocument {
  uri: string;
  name?: string;
  type?: string;
}

interface Props {
  documents: ViewerDocument[];
  initialIndex?: number;
  /** Shown above the document name, e.g. the project name. */
  title: string;
  onClose: () => void;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; kind: DocumentKind; blobUrl: string; text?: string; pageCount?: number; renderedPages?: number };

const MAX_TEXT_CHARS = 200_000;

const fileNameOf = (doc: ViewerDocument, kind?: DocumentKind) => {
  if (doc.name) return doc.name;
  const cid = ipfsPath(doc.uri).split('/')[0];
  return kind === 'pdf' ? `${cid}.pdf` : cid;
};

/**
 * In-page preview of a project's MRV documents, fetched straight from IPFS.
 * The visitor stays on the page; Download saves the exact bytes shown and
 * "Open on IPFS" is there for anyone who wants to check the file themselves.
 * Mount it only while open: it loads the document (and pdf.js) on mount.
 */
export default function DocumentViewer({ documents, initialIndex = 0, title, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(() => Math.min(Math.max(initialIndex, 0), documents.length - 1));
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  const doc = documents[index];
  const gatewayUrl = ipfsToHttp(doc.uri, doc.name);

  // Open as a modal on mount; Esc and the close event come from <dialog>.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    closeRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
      if (dialog?.open) dialog.close();
    };
  }, []);

  // Fetch the current document, then render it by kind.
  useEffect(() => {
    const controller = new AbortController();
    let blobUrl: string | null = null;
    setState({ status: 'loading' });
    pagesRef.current?.replaceChildren();

    (async () => {
      const response = await fetch(gatewayUrl, { signal: controller.signal });
      if (!response.ok) throw new Error(`The IPFS gateway answered HTTP ${response.status}.`);
      const kind = documentKind(response.headers.get('content-type'), doc.name, doc.type);
      const data = await response.arrayBuffer();
      if (controller.signal.aborted) return;
      const mime = kind === 'pdf' ? 'application/pdf' : response.headers.get('content-type') || 'application/octet-stream';
      blobUrl = URL.createObjectURL(new Blob([data], { type: mime }));

      if (kind === 'text') {
        const text = new TextDecoder().decode(data);
        setState({ status: 'ready', kind, blobUrl, text: text.length > MAX_TEXT_CHARS ? `${text.slice(0, MAX_TEXT_CHARS)}\n…` : text });
        return;
      }
      if (kind !== 'pdf') {
        setState({ status: 'ready', kind, blobUrl });
        return;
      }
      // Pages render while the loading line is still shown; the container is
      // always laid out, so its width is known and pages come out sharp.
      const container = pagesRef.current;
      if (!container) return;
      const result = await renderPdf(data, container, controller.signal);
      if (!controller.signal.aborted) {
        setState({ status: 'ready', kind, blobUrl, pageCount: result.pageCount, renderedPages: result.renderedPages });
      }
    })().catch((error: unknown) => {
      if (controller.signal.aborted) return;
      const message = error instanceof Error && error.message.startsWith('The IPFS gateway')
        ? error.message
        : 'The document could not be displayed here.';
      setState({ status: 'error', message });
    });

    return () => {
      controller.abort();
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [gatewayUrl, doc.name, doc.type, attempt]);

  const ready = state.status === 'ready' ? state : null;
  const cid = ipfsPath(doc.uri);

  return (
    <dialog
      ref={dialogRef}
      className="doc-viewer"
      aria-label={`${title}: ${fileNameOf(doc)}`}
      onClose={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="doc-viewer__frame">
        <header className="doc-viewer__bar">
          <div className="doc-viewer__heading">
            <span className="doc-viewer__eyebrow">
              MRV DOCUMENT{documents.length > 1 ? ` · ${index + 1} / ${documents.length}` : ''}
            </span>
            <span className="doc-viewer__title" title={`${title} · ${fileNameOf(doc)}`}>
              {title} <span className="doc-viewer__file">· {fileNameOf(doc, ready?.kind)}</span>
            </span>
          </div>
          <div className="doc-viewer__actions">
            {ready && (
              <a className="doc-viewer__btn doc-viewer__btn--primary" href={ready.blobUrl} download={fileNameOf(doc, ready.kind)}>
                Download
              </a>
            )}
            <a className="doc-viewer__btn" href={gatewayUrl} target="_blank" rel="noopener noreferrer">
              Open on IPFS ↗
            </a>
            <button ref={closeRef} type="button" className="doc-viewer__close" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
        </header>

        {documents.length > 1 && (
          <nav className="doc-viewer__tabs" aria-label="Documents">
            {documents.map((item, i) => (
              <button
                key={`${item.uri}-${i}`}
                type="button"
                className="doc-viewer__tab"
                aria-current={i === index ? 'true' : undefined}
                onClick={() => setIndex(i)}
              >
                {fileNameOf(item)}
              </button>
            ))}
          </nav>
        )}

        <div className="doc-viewer__body">
          {state.status === 'loading' && (
            <div className="doc-viewer__status" role="status">Loading the document from IPFS…</div>
          )}
          {state.status === 'error' && (
            <div className="doc-viewer__status" role="alert">
              <p>{state.message}</p>
              <div className="doc-viewer__status-actions">
                <button type="button" className="doc-viewer__btn" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
                <a className="doc-viewer__btn" href={gatewayUrl} target="_blank" rel="noopener noreferrer">Open on IPFS ↗</a>
              </div>
            </div>
          )}
          {ready?.kind === 'text' && <pre className="doc-viewer__text">{ready.text}</pre>}
          {ready?.kind === 'image' && <img className="doc-viewer__image" src={ready.blobUrl} alt={fileNameOf(doc)} />}
          {ready?.kind === 'other' && (
            <div className="doc-viewer__status">
              <p>This file type has no preview. Download it or open it on IPFS.</p>
            </div>
          )}
          {/* PDF pages are drawn here as canvases; empty (no height) otherwise. */}
          <div ref={pagesRef} className="doc-viewer__pages" />
          {ready?.kind === 'pdf' && ready.pageCount != null && ready.renderedPages != null && ready.renderedPages < ready.pageCount && (
            <p className="doc-viewer__more">
              Showing the first {ready.renderedPages} of {ready.pageCount} pages. Download or open on IPFS for the full document.
            </p>
          )}
        </div>

        <footer className="doc-viewer__foot">
          <span>Stored on IPFS · CID</span>
          <code title={cid}>{cid}</code>
          <span className="doc-viewer__foot-note">The CID changes if a single byte of the file changes.</span>
        </footer>
      </div>
    </dialog>
  );
}
