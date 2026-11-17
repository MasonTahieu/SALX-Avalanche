import { useEffect, useRef } from 'react';

/**
 * Renders a pointer-reactive spotlight + tech coordinate grid behind page content.
 * Updates CSS custom properties directly on DOM nodes via rAF to avoid React re-renders.
 */
export function CursorAmbientGlow() {
  const glowRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const glowEl = glowRef.current;
    const gridEl = gridRef.current;
    if (!glowEl || !gridEl) return;

    const mq = typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
    if (mq?.matches) return;

    let frame = 0;
    let targetX = 50;
    let targetY = 30;
    let currentX = 50;
    let currentY = 30;

    const applyPos = (x: number, y: number) => {
      const mx = `${x.toFixed(2)}%`;
      const my = `${y.toFixed(2)}%`;
      glowEl.style.setProperty('--mx', mx);
      glowEl.style.setProperty('--my', my);
      gridEl.style.setProperty('--mx', mx);
      gridEl.style.setProperty('--my', my);
    };

    const tick = () => {
      frame = 0;
      currentX += (targetX - currentX) * 0.16;
      currentY += (targetY - currentY) * 0.16;
      applyPos(currentX, currentY);
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

  return (
    <>
      <div ref={gridRef} className="cursor-ambient-grid" aria-hidden="true" />
      <div ref={glowRef} className="cursor-ambient-glow" aria-hidden="true" />
    </>
  );
}
