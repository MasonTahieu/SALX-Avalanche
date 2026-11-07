import { lazy, Suspense, type MouseEvent } from 'react';
import type { ViewerDocument } from './DocumentViewer';

export type { ViewerDocument };

// The viewer (and pdf.js behind it) is fetched on the first click only.
const DocumentViewer = lazy(() => import('./DocumentViewer'));

export function LazyDocumentViewer(props: {
  documents: ViewerDocument[];
  initialIndex?: number;
  title: string;
  onClose: () => void;
}) {
  return (
    <Suspense fallback={null}>
      <DocumentViewer {...props} />
    </Suspense>
  );
}

/** Project metadata `documents` (objects or bare URIs) as viewer entries. */
export function toViewerDocuments(raw: unknown): ViewerDocument[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item): ViewerDocument | null => {
      if (typeof item === 'string') return item ? { uri: item } : null;
      if (item && typeof item === 'object' && typeof (item as ViewerDocument).uri === 'string') {
        const { uri, name, type } = item as ViewerDocument;
        return { uri, ...(name && { name }), ...(type && { type }) };
      }
      return null;
    })
    .filter((item): item is ViewerDocument => Boolean(item?.uri));
}

/**
 * For a document link: a plain click opens the in-page viewer; Ctrl/Cmd/
 * Shift/middle click keep the browser's own new-tab behaviour on the href.
 * Returns true when the click was taken over.
 */
export function openInPlace(event: MouseEvent<HTMLAnchorElement>, open: () => void) {
  event.stopPropagation();
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  event.preventDefault();
  open();
  return true;
}
