import { useEffect, useRef } from 'react';
import './CertificateLightbox.css';

interface Props {
  open: boolean;
  onClose: () => void;
  imageUrl: string;
  downloadUrl: string;
  title: string;
  alt: string;
}

// Full-screen view of a certificate image. Nothing is downloaded unless the
// holder presses Download. Closes on Esc, the ✕ button or a click outside.
export function CertificateLightbox({ open, onClose, imageUrl, downloadUrl, title, alt }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // Start on Close, so Enter never triggers a download by accident.
      closeRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Keep the page behind still while zoomed.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="cert-lightbox"
      aria-label={title}
      onClose={onClose}
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}
      // Arrow keys belong to the zoom view, not to a carousel behind it.
      onKeyDown={event => event.stopPropagation()}
    >
      {open && (
        <div className="cert-lightbox__frame">
          <div className="cert-lightbox__bar">
            <span className="cert-lightbox__title">{title}</span>
            <a className="cert-lightbox__download" href={downloadUrl} download>
              Download PNG
            </a>
            <button ref={closeRef} type="button" className="cert-lightbox__close" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
          <img className="cert-lightbox__image" src={imageUrl} alt={alt} width={1000} height={1000} />
        </div>
      )}
    </dialog>
  );
}
