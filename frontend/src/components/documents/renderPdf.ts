// pdf.js is loaded only when someone opens a PDF (~0.5 MB + 1.3 MB worker),
// never with the page. The legacy build supports older mobile browsers.
type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');

let pdfjsPromise: Promise<PdfJs> | null = null;

function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ]).then(([pdfjs, worker]) => {
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs;
  }).catch((error) => {
    pdfjsPromise = null; // allow a retry after a failed chunk load
    throw error;
  });
  return pdfjsPromise;
}

// Enough for any MRV summary or report; longer files point to the full view.
const MAX_PAGES = 30;

export interface PdfRenderResult {
  pageCount: number;
  renderedPages: number;
}

/**
 * Draws the PDF's pages as canvases inside `container`, sized to its width
 * (sharp on high-DPI screens). Stops early if `signal` aborts.
 */
export async function renderPdf(data: ArrayBuffer, container: HTMLElement, signal: AbortSignal): Promise<PdfRenderResult> {
  const pdfjs = await loadPdfJs();
  // getDocument takes ownership of the buffer, so it gets its own copy.
  const task = pdfjs.getDocument({ data: new Uint8Array(data.slice(0)) });
  try {
    const pdf = await task.promise;
    // A newer document may have taken over the container while this one loaded.
    if (signal.aborted) return { pageCount: pdf.numPages, renderedPages: 0 };
    container.replaceChildren();
    const cssWidth = Math.max(280, container.clientWidth);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const pages = Math.min(pdf.numPages, MAX_PAGES);
    let rendered = 0;
    for (let number = 1; number <= pages; number += 1) {
      if (signal.aborted) break;
      const page = await pdf.getPage(number);
      if (signal.aborted) break;
      const scale = cssWidth / page.getViewport({ scale: 1 }).width;
      const viewport = page.getViewport({ scale: scale * pixelRatio });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.className = 'doc-viewer__page';
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', `Page ${number} of ${pdf.numPages}`);
      container.append(canvas);
      await page.render({ canvas, viewport }).promise;
      page.cleanup();
      rendered += 1;
    }
    return { pageCount: pdf.numPages, renderedPages: rendered };
  } finally {
    await task.destroy();
  }
}
