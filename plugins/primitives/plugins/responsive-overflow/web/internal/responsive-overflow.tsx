import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export interface UseResponsiveOverflowOptions {
  count: number;
  gap?: number;
}

export interface UseResponsiveOverflowHandle {
  containerRef: RefObject<HTMLDivElement | null>;
  measureRef: RefObject<HTMLDivElement | null>;
  visibleCount: number;
}

export function useResponsiveOverflow({
  count,
  gap = 4,
}: UseResponsiveOverflowOptions): UseResponsiveOverflowHandle {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(count);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;

    const recompute = () => {
      const available = container.offsetWidth;
      const items = Array.from(measure.children) as HTMLElement[];

      if (items.length === 0) {
        setVisibleCount(0);
        return;
      }

      const totalW = items.reduce(
        (acc, el, i) => acc + el.offsetWidth + (i > 0 ? gap : 0),
        0,
      );
      if (totalW <= available) {
        setVisibleCount(items.length);
        return;
      }

      let used = 0;
      let fitCount = 0;
      for (const [i, item] of items.entries()) {
        const gapBefore = i > 0 ? gap : 0;
        const next = used + gapBefore + item.offsetWidth;
        if (next <= available) {
          used = next;
          fitCount = i + 1;
        } else {
          break;
        }
      }
      setVisibleCount(fitCount);
    };

    let rafId: number | null = null;
    const ro = new ResizeObserver(() => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(recompute);
    });
    ro.observe(container);
    recompute();
    return () => {
      ro.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [count, gap]);

  return { containerRef, measureRef, visibleCount };
}

export interface ResponsiveOverflowProps {
  children: ReactNode[];
  /** Gap between children in pixels. Default: 4 (= gap-1). */
  gap?: number;
  className?: string;
}

export function ResponsiveOverflow({
  children,
  gap = 4,
  className,
}: ResponsiveOverflowProps) {
  const { containerRef, measureRef, visibleCount } = useResponsiveOverflow({
    count: children.length,
    gap,
  });

  return (
    <>
      {children.length > 0 &&
        createPortal(
          <div
            ref={measureRef}
            style={{
              position: "fixed",
              top: -9999,
              left: -9999,
              display: "flex",
              gap,
              opacity: 0,
              pointerEvents: "none",
            }}
            aria-hidden="true"
          >
            {children.map((child, i) => (
              <div key={i}>{child}</div>
            ))}
          </div>,
          document.body,
        )}

      <div
        ref={containerRef}
        className={cn("inline-flex min-w-0 overflow-hidden", className)}
        style={{ gap }}
      >
        {children.slice(0, visibleCount)}
      </div>
    </>
  );
}
