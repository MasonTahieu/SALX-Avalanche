import { useEffect, useRef } from 'react';

/**
 * Renders a subtle, pointer-reactive dual-tone ambient glow behind page content.
 * Updates CSS custom properties directly on the DOM node via rAF to avoid React re-renders.
 */
export function CursorAmbientGlow() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const mq = typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
    if (mq?.matches) return;

    let frame = 0;
    let targetX = 50;
    let targetY = 30;
    let currentX = 50;
    let currentY = 30;

    const tick = () => {
      frame = 0;
      currentX += (targetX - currentX) * 0.14;
      currentY += (targetY - currentY) * 0.14;
      el.style.setProperty('--mx', `${currentX.toFixed(2)}%`);
      el.style.setProperty('--my', `${currentY.toFixed(2)}%`);
      if (Math.abs(targetX - currentX) > 0.08 || Math.abs(targetY - currentY) > 0.08) {
        frame = requestAnimationFrame(tick);
      }
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      targetX = Math.max(0, Math.min(100, (e.clientX / Math.max(1, window.innerWidth)) * 100));
      targetY = Math.max(0, Math.min(100, (e.clientY / Math.max(1, window.innerHeight)) * 100));
      if (!frame) frame = requestAnimationFrame(tick);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return <div ref={ref} className="cursor-ambient-glow" aria-hidden="true" />;
}
