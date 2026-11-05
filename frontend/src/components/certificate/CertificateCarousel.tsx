import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { Certificate, Project } from '../../types/domain';
import { env } from '../../config/env';
import { CertificateCard } from './CertificateCard';
import { CertBadge, MONO } from '../dashboard/DashboardKit';
import './CertificateCarousel.css';

interface Props {
  certificates: Certificate[];
  projects: Map<number, Project>;
  /** Index of the certificate to open first (e.g. from ?sbt= in the URL). */
  initialIndex?: number;
  onIndexChange?: (index: number) => void;
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// The holder's SBT collection, one certificate at a time: arrows, a counter,
// a thumbnail strip, swipe (scroll-snap) and ←/→ when the carousel has focus.
export function CertificateCarousel({ certificates, projects, initialIndex = 0, onIndexChange }: Props) {
  const total = certificates.length;
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbsRef = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);
  const clamp = useCallback((value: number) => Math.min(Math.max(value, 0), Math.max(total - 1, 0)), [total]);
  const [index, setIndex] = useState(() => clamp(initialIndex));

  // Open on the requested certificate without animating.
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (track) track.scrollLeft = clamp(initialIndex) * track.clientWidth;
    // Only on mount: later changes come from the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the index valid if the collection shrinks.
  useEffect(() => { setIndex(current => clamp(current)); }, [clamp]);

  // Report index changes only (the callback may change identity every render).
  const onIndexChangeRef = useRef(onIndexChange);
  onIndexChangeRef.current = onIndexChange;
  useEffect(() => { onIndexChangeRef.current?.(index); }, [index]);

  // Keep the active thumbnail visible in the strip.
  useEffect(() => {
    const strip = thumbsRef.current;
    const active = strip?.children[index] as HTMLElement | undefined;
    if (!strip || !active) return;
    const left = active.offsetLeft - strip.offsetLeft;
    if (left < strip.scrollLeft || left + active.offsetWidth > strip.scrollLeft + strip.clientWidth) {
      strip.scrollTo({ left: left - strip.clientWidth / 2 + active.offsetWidth / 2, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }
  }, [index]);

  const goTo = useCallback((target: number) => {
    const next = clamp(target);
    const track = trackRef.current;
    if (track) track.scrollTo({ left: next * track.clientWidth, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    setIndex(next);
  }, [clamp]);

  // Swipes and trackpad scrolling move the track; follow it.
  const onScroll = () => {
    if (frame.current != null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const track = trackRef.current;
      if (!track || !track.clientWidth) return;
      const current = clamp(Math.round(track.scrollLeft / track.clientWidth));
      setIndex(prev => (prev === current ? prev : current));
    });
  };
  useEffect(() => () => { if (frame.current != null) cancelAnimationFrame(frame.current); }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowRight') { event.preventDefault(); goTo(index + 1); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); goTo(index - 1); }
    else if (event.key === 'Home') { event.preventDefault(); goTo(0); }
    else if (event.key === 'End') { event.preventDefault(); goTo(total - 1); }
  };

  if (total === 0) return null;
  const multiple = total > 1;

  return (
    <section className="sbt-carousel" aria-roledescription="carousel" aria-label="Retirement certificates">
      {multiple && (
        <button type="button" className="sbt-carousel__side sbt-carousel__side--prev" onClick={() => goTo(index - 1)} disabled={index === 0} aria-label="Previous certificate">
          ‹
        </button>
      )}

      <div
        ref={trackRef}
        className="sbt-carousel__track"
        onScroll={multiple ? onScroll : undefined}
        onKeyDown={multiple ? onKeyDown : undefined}
        tabIndex={multiple ? 0 : undefined}
        aria-label={multiple ? 'Use the left and right arrow keys to browse certificates' : undefined}
      >
        {certificates.map((certificate, i) => (
          <div
            key={certificate.certificateTokenId}
            className="sbt-carousel__slide"
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${total}: SBT #${certificate.certificateTokenId}`}
            // Off-screen slides stay out of the tab order and the accessibility tree.
            inert={i !== index}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, padding: '0 2px' }}>
              <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.08em', color: 'var(--ink)' }}>
                SBT #{certificate.certificateTokenId}
              </span>
              <CertBadge status={certificate.status} />
            </div>
            {/* The visible certificate and its neighbours load right away so arrows feel instant. */}
            <CertificateCard certificate={certificate} project={projects.get(certificate.projectId)} eager={Math.abs(i - index) <= 1} />
          </div>
        ))}
      </div>

      {multiple && (
        <button type="button" className="sbt-carousel__side sbt-carousel__side--next" onClick={() => goTo(index + 1)} disabled={index === total - 1} aria-label="Next certificate">
          ›
        </button>
      )}

      {multiple && (
        <div className="sbt-carousel__bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <button type="button" className="sbt-carousel__step" onClick={() => goTo(index - 1)} disabled={index === 0} aria-label="Previous certificate">←</button>
            <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.08em', color: 'var(--ink)', minWidth: 44, textAlign: 'center' }} aria-live="polite">
              {index + 1} / {total}
            </span>
            <button type="button" className="sbt-carousel__step" onClick={() => goTo(index + 1)} disabled={index === total - 1} aria-label="Next certificate">→</button>
          </div>
          <div ref={thumbsRef} className="sbt-carousel__thumbs" role="group" aria-label="Choose a certificate">
            {certificates.map((certificate, i) => (
              <button
                key={certificate.certificateTokenId}
                type="button"
                className={`sbt-carousel__thumb${certificate.status === 'REVOKED' ? ' sbt-carousel__thumb--revoked' : ''}`}
                aria-current={i === index}
                aria-label={`SBT #${certificate.certificateTokenId}, ${certificate.retiredCO2Kg.toLocaleString("en-US")} kg CO₂e, ${certificate.status.toLowerCase()}`}
                title={`SBT #${certificate.certificateTokenId} · ${certificate.retiredCO2Kg.toLocaleString("en-US")} kg CO₂e · ${certificate.status}`}
                onClick={() => goTo(i)}
              >
                <img
                  src={`${env.apiUrl}/api/certificates/token/${certificate.certificateTokenId}/image.png?size=thumb`}
                  alt=""
                  width={56}
                  height={56}
                  loading="lazy"
                  decoding="async"
                />
                <span>#{certificate.certificateTokenId}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
