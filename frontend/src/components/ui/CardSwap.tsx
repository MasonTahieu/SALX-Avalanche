import React, {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
  type ReactElement,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import gsap from 'gsap';

export interface CardSwapHandle {
  next: () => void;
  prev: () => void;
  goTo: (idx: number) => void;
}

export interface CardSwapProps {
  width?: number | string;
  height?: number | string;
  cardDistance?: number;
  verticalDistance?: number;
  delay?: number;
  pauseOnHover?: boolean;
  onCardClick?: (idx: number) => void;
  onActiveChange?: (idx: number) => void;
  skewAmount?: number;
  easing?: 'linear' | 'elastic';
  children: ReactNode;
}

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  customClass?: string;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(({ customClass, className, style, ...rest }, ref) => (
  <div
    ref={ref}
    {...rest}
    style={{
      borderRadius: 18,
      border: '1px solid var(--bd2)',
      background: 'var(--surf)',
      boxShadow: '0 24px 64px rgba(0, 0, 0, 0.42)',
      ...style,
    }}
    className={`absolute top-1/2 left-1/2 [transform-style:preserve-3d] [will-change:transform] [backface-visibility:hidden] transition-[border-color,box-shadow] duration-200 hover:border-[var(--g)] hover:shadow-[0_26px_70px_rgba(0,229,163,0.18)] ${customClass ?? ''} ${className ?? ''}`.trim()}
  />
));

Card.displayName = 'Card';

type CardRef = RefObject<HTMLDivElement | null>;

interface Slot {
  x: number;
  y: number;
  z: number;
  zIndex: number;
}

const makeSlot = (i: number, distX: number, distY: number, total: number): Slot => ({
  x: i * distX,
  y: -i * distY,
  z: -i * distX * 1.5,
  zIndex: total - i,
});

const placeNow = (el: HTMLElement, slot: Slot, skew: number) =>
  gsap.set(el, {
    x: slot.x,
    y: slot.y,
    z: slot.z,
    xPercent: -50,
    yPercent: -50,
    skewY: skew,
    transformOrigin: 'center center',
    zIndex: slot.zIndex,
    force3D: true,
  });

export const CardSwap = forwardRef<CardSwapHandle, CardSwapProps>(({
  width = 500,
  height = 400,
  cardDistance = 60,
  verticalDistance = 70,
  delay = 4200,
  pauseOnHover = false,
  onCardClick,
  onActiveChange,
  skewAmount = 6,
  easing = 'elastic',
  children,
}, ref) => {
  const config = useMemo(
    () =>
      easing === 'elastic'
        ? {
            ease: 'elastic.out(0.6,0.9)',
            durDrop: 1.6,
            durMove: 1.6,
            durReturn: 1.6,
            promoteOverlap: 0.85,
            returnDelay: 0.05,
          }
        : {
            ease: 'power2.inOut',
            durDrop: 0.7,
            durMove: 0.7,
            durReturn: 0.7,
            promoteOverlap: 0.45,
            returnDelay: 0.2,
          },
    [easing],
  );

  const childArr = useMemo(() => Children.toArray(children) as ReactElement<CardProps>[], [children]);
  const refs = useMemo<CardRef[]>(() => childArr.map(() => React.createRef<HTMLDivElement>()), [childArr.length]);
  const order = useRef<number[]>(Array.from({ length: childArr.length }, (_, i) => i));
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const intervalRef = useRef<number>(0);
  const container = useRef<HTMLDivElement>(null);

  const layoutInstant = useCallback((nextOrder: number[]) => {
    order.current = nextOrder;
    const total = refs.length;
    nextOrder.forEach((idx, slotIdx) => {
      const el = refs[idx]?.current;
      if (el) {
        gsap.killTweensOf(el);
        placeNow(el, makeSlot(slotIdx, cardDistance, verticalDistance, total), skewAmount);
      }
    });
    if (nextOrder.length > 0) onActiveChange?.(nextOrder[0]);
  }, [refs, cardDistance, verticalDistance, skewAmount, onActiveChange]);

  const swapNext = useCallback(() => {
    if (order.current.length < 2) return;
    if (tlRef.current?.isActive()) return;

    const [front, ...rest] = order.current;
    const elFront = refs[front]?.current;
    if (!elFront) return;

    const tl = gsap.timeline();
    tlRef.current = tl;

    tl.to(elFront, {
      y: '+=460',
      duration: config.durDrop,
      ease: config.ease,
    });

    tl.addLabel('promote', `-=${config.durDrop * config.promoteOverlap}`);
    onActiveChange?.(rest[0]);
    rest.forEach((idx, i) => {
      const el = refs[idx]?.current;
      if (!el) return;
      const slot = makeSlot(i, cardDistance, verticalDistance, refs.length);
      tl.set(el, { zIndex: slot.zIndex }, 'promote');
      tl.to(
        el,
        {
          x: slot.x,
          y: slot.y,
          z: slot.z,
          duration: config.durMove,
          ease: config.ease,
        },
        `promote+=${i * 0.12}`,
      );
    });

    const backSlot = makeSlot(refs.length - 1, cardDistance, verticalDistance, refs.length);
    tl.addLabel('return', `promote+=${config.durMove * config.returnDelay}`);
    tl.call(
      () => {
        gsap.set(elFront, { zIndex: backSlot.zIndex });
      },
      undefined,
      'return',
    );

    tl.to(
      elFront,
      {
        x: backSlot.x,
        y: backSlot.y,
        z: backSlot.z,
        duration: config.durReturn,
        ease: config.ease,
      },
      'return',
    );

    tl.call(() => {
      order.current = [...rest, front];
    });
  }, [refs, cardDistance, verticalDistance, config, onActiveChange]);

  const swapPrev = useCallback(() => {
    if (order.current.length < 2) return;
    tlRef.current?.kill();
    const last = order.current[order.current.length - 1];
    const rest = order.current.slice(0, -1);
    const nextOrder = [last, ...rest];
    order.current = nextOrder;
    onActiveChange?.(last);

    nextOrder.forEach((idx, i) => {
      const el = refs[idx]?.current;
      if (!el) return;
      const slot = makeSlot(i, cardDistance, verticalDistance, refs.length);
      gsap.set(el, { zIndex: slot.zIndex });
      gsap.to(el, {
        x: slot.x,
        y: slot.y,
        z: slot.z,
        duration: 0.6,
        ease: 'power2.out',
      });
    });
  }, [refs, cardDistance, verticalDistance, onActiveChange]);

  const goTo = useCallback((targetIdx: number) => {
    const pos = order.current.indexOf(targetIdx);
    if (pos <= 0) return;
    tlRef.current?.kill();
    const rotated = [...order.current.slice(pos), ...order.current.slice(0, pos)];
    order.current = rotated;
    onActiveChange?.(targetIdx);
    rotated.forEach((idx, i) => {
      const el = refs[idx]?.current;
      if (!el) return;
      const slot = makeSlot(i, cardDistance, verticalDistance, refs.length);
      gsap.set(el, { zIndex: slot.zIndex });
      gsap.to(el, {
        x: slot.x,
        y: slot.y,
        z: slot.z,
        duration: 0.55,
        ease: 'power2.out',
      });
    });
  }, [refs, cardDistance, verticalDistance, onActiveChange]);

  useImperativeHandle(ref, () => ({
    next: swapNext,
    prev: swapPrev,
    goTo,
  }), [swapNext, swapPrev, goTo]);

  useEffect(() => {
    const initial = Array.from({ length: childArr.length }, (_, i) => i);
    layoutInstant(initial);

    const reducedMotion =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion || refs.length < 2) return;

    intervalRef.current = window.setInterval(swapNext, delay);

    if (pauseOnHover && container.current) {
      const node = container.current;
      const pause = () => {
        tlRef.current?.pause();
        clearInterval(intervalRef.current);
      };
      const resume = () => {
        tlRef.current?.play();
        clearInterval(intervalRef.current);
        intervalRef.current = window.setInterval(swapNext, delay);
      };
      node.addEventListener('mouseenter', pause);
      node.addEventListener('mouseleave', resume);
      return () => {
        node.removeEventListener('mouseenter', pause);
        node.removeEventListener('mouseleave', resume);
        clearInterval(intervalRef.current);
        tlRef.current?.kill();
      };
    }

    return () => {
      clearInterval(intervalRef.current);
      tlRef.current?.kill();
    };
  }, [childArr.length, delay, pauseOnHover, layoutInstant, swapNext, refs.length]);

  const rendered = childArr.map((child, i) =>
    isValidElement<CardProps>(child)
      ? cloneElement(child, {
          key: i,
          ref: refs[i],
          style: { width, height, ...(child.props.style ?? {}) },
          onClick: (e: React.MouseEvent<HTMLDivElement>) => {
            child.props.onClick?.(e);
            onCardClick?.(i);
          },
        } as CardProps & React.RefAttributes<HTMLDivElement>)
      : child,
  );

  return (
    <div
      ref={container}
      className="relative perspective-[1200px] transform-gpu"
      style={{ width, height }}
    >
      <div className="absolute inset-0 [transform-style:preserve-3d]">
        {rendered}
      </div>
    </div>
  );
});

CardSwap.displayName = 'CardSwap';

export default CardSwap;
