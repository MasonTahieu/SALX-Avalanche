import { useEffect, useId, useState } from 'react';
import { certificateImageUrl } from '../../lib/certificateImage';

function InstagramShareOptions({ id, tokenId }: { id: string; tokenId: number }) {
  const filename = `SALX-SBT-${tokenId}.png`;
  const [supportsFiles] = useState(() => (
    typeof navigator.share === 'function'
    && navigator.canShare?.({ files: [new File([], filename, { type: 'image/png' })] }) === true
  ));
  const [file, setFile] = useState<File | null>(null);
  const [sharing, setSharing] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (!supportsFiles) return;
    const controller = new AbortController();

    // Prepare the image before the Share image tap so that navigator.share can
    // run while the browser still treats that tap as a user gesture.
    const prepareImage = async () => {
      try {
        const response = await fetch(certificateImageUrl(tokenId), { signal: controller.signal });
        if (!response.ok) throw new Error('Certificate image unavailable');
        const blob = await response.blob();
        if (blob.type !== 'image/png' || !blob.size) throw new Error('Invalid certificate image');
        const image = new File([blob], filename, { type: blob.type });
        if (!navigator.canShare({ files: [image] })) throw new Error('Image sharing unavailable');
        if (!controller.signal.aborted) setFile(image);
      } catch {
        if (!controller.signal.aborted) setStatus('Could not prepare the image for sharing. You can still try downloading it.');
      }
    };

    void prepareImage();
    return () => controller.abort();
  }, [filename, supportsFiles, tokenId]);

  const shareImage = async () => {
    if (!file || sharing) return;
    setSharing(true);
    setStatus('');
    try {
      await navigator.share({ files: [file] });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setStatus('Could not open the share menu. Download the image to upload it on Instagram.');
      }
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="verify__instagram" id={id}>
      <p>{supportsFiles
        ? 'Choose Instagram if it appears in your share menu, or download the image to upload it yourself.'
        : 'Download the certificate image and upload it on Instagram.'}</p>
      <div className="verify__instagram-actions">
        {file && (
          <button type="button" className="verify__button" onClick={() => void shareImage()} disabled={sharing}>
            Share image
          </button>
        )}
        <a className="verify__button" href={certificateImageUrl(tokenId, 'download')}>Download image</a>
        <a className="verify__button" href="https://www.instagram.com/" target="_blank" rel="noreferrer">Open Instagram ↗</a>
      </div>
      <p className="verify__instagram-status" role="status">
        {status || (supportsFiles && !file ? 'Preparing the image…' : '')}
      </p>
    </div>
  );
}

export function InstagramShare({ tokenId }: { tokenId: number }) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <>
      <button
        type="button"
        className="verify__button"
        aria-controls={open ? id : undefined}
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
      >
        Share on Instagram
      </button>
      {open && <InstagramShareOptions id={id} tokenId={tokenId} />}
    </>
  );
}
