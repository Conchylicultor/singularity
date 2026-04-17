import { useRef, useState } from "react";

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Point {
  x: number;
  y: number;
}

interface Props {
  /** Where the underlying image is rendered, in container-local CSS pixels. */
  displayed: DOMRect;
  /** Natural pixel dimensions of the image. */
  natural: { w: number; h: number };
  rect: CropRect | null;
  onChange: (r: CropRect | null) => void;
}

export function CropOverlay({ displayed, natural, rect, onChange }: Props) {
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [dragEnd, setDragEnd] = useState<Point | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const scaleX = natural.w / displayed.width;
  const scaleY = natural.h / displayed.height;

  function localPoint(e: React.PointerEvent | PointerEvent): Point {
    const el = overlayRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return {
      x: clamp(e.clientX - r.left, 0, r.width),
      y: clamp(e.clientY - r.top, 0, r.height),
    };
  }

  function commit(start: Point, end: Point) {
    const x0 = Math.min(start.x, end.x);
    const y0 = Math.min(start.y, end.y);
    const w = Math.abs(end.x - start.x);
    const h = Math.abs(end.y - start.y);
    if (w < 2 || h < 2) {
      onChange(null);
      return;
    }
    onChange({
      x: x0 * scaleX,
      y: y0 * scaleY,
      w: w * scaleX,
      h: h * scaleY,
    });
  }

  // Live rectangle in displayed (CSS) coords for rendering the visualizer.
  const displayedRect = (() => {
    if (dragStart && dragEnd) {
      const x = Math.min(dragStart.x, dragEnd.x);
      const y = Math.min(dragStart.y, dragEnd.y);
      const w = Math.abs(dragEnd.x - dragStart.x);
      const h = Math.abs(dragEnd.y - dragStart.y);
      return { x, y, w, h };
    }
    if (rect) {
      return {
        x: rect.x / scaleX,
        y: rect.y / scaleY,
        w: rect.w / scaleX,
        h: rect.h / scaleY,
      };
    }
    return null;
  })();

  return (
    <div
      ref={overlayRef}
      className="absolute cursor-crosshair touch-none select-none"
      style={{
        left: displayed.x,
        top: displayed.y,
        width: displayed.width,
        height: displayed.height,
      }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        const p = localPoint(e);
        setDragStart(p);
        setDragEnd(p);
        onChange(null);
      }}
      onPointerMove={(e) => {
        if (!dragStart) return;
        setDragEnd(localPoint(e));
      }}
      onPointerUp={(e) => {
        if (!dragStart) return;
        const end = localPoint(e);
        commit(dragStart, end);
        setDragStart(null);
        setDragEnd(null);
      }}
    >
      {displayedRect && (
        <>
          {/* 4-rect vignette: top, left, right, bottom relative to selection */}
          <div
            className="pointer-events-none absolute bg-black/50"
            style={{ left: 0, top: 0, right: 0, height: displayedRect.y }}
          />
          <div
            className="pointer-events-none absolute bg-black/50"
            style={{
              left: 0,
              top: displayedRect.y,
              width: displayedRect.x,
              height: displayedRect.h,
            }}
          />
          <div
            className="pointer-events-none absolute bg-black/50"
            style={{
              left: displayedRect.x + displayedRect.w,
              top: displayedRect.y,
              right: 0,
              height: displayedRect.h,
            }}
          />
          <div
            className="pointer-events-none absolute bg-black/50"
            style={{
              left: 0,
              top: displayedRect.y + displayedRect.h,
              right: 0,
              bottom: 0,
            }}
          />
          {/* Selection border */}
          <div
            className="pointer-events-none absolute border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.5)]"
            style={{
              left: displayedRect.x,
              top: displayedRect.y,
              width: displayedRect.w,
              height: displayedRect.h,
            }}
          />
        </>
      )}
    </div>
  );
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
