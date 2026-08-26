import { Placed } from "@plugins/primitives/plugins/css/plugins/coords/web";
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
  onCommit: (r: CropRect) => void;
}

export function CropOverlay({ displayed, natural, onCommit }: Props) {
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
    if (w < 2 || h < 2) return;
    onCommit({
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
    return null;
  })();

  return (
    // `Placed` IS the capture surface — never a wrapper around one. The pointer
    // handlers below call `setPointerCapture` on `e.currentTarget`, so a wrapper
    // would put the capture on a different element than the one being dragged.
    <Placed
      ref={overlayRef}
      x={{ start: displayed.x, size: displayed.width }}
      y={{ start: displayed.y, size: displayed.height }}
      className="cursor-crosshair touch-none select-none"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        const p = localPoint(e);
        setDragStart(p);
        setDragEnd(p);
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
          <Placed
            decorative
            x={{ start: 0, end: 0 }}
            y={{ start: 0, size: displayedRect.y }}
            className="bg-black/50"
          />
          <Placed
            decorative
            x={{ start: 0, size: displayedRect.x }}
            y={{ start: displayedRect.y, size: displayedRect.h }}
            className="bg-black/50"
          />
          <Placed
            decorative
            x={{ start: displayedRect.x + displayedRect.w, end: 0 }}
            y={{ start: displayedRect.y, size: displayedRect.h }}
            className="bg-black/50"
          />
          <Placed
            decorative
            x={{ start: 0, end: 0 }}
            y={{ start: displayedRect.y + displayedRect.h, end: 0 }}
            className="bg-black/50"
          />
          {/* Selection border */}
          <Placed
            decorative
            x={{ start: displayedRect.x, size: displayedRect.w }}
            y={{ start: displayedRect.y, size: displayedRect.h }}
            className="border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.5)]"
          />
        </>
      )}
    </Placed>
  );
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
