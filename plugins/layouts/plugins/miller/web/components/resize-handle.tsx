import { useCallback, type PointerEvent as ReactPointerEvent } from "react";
import { MdChevronLeft } from "react-icons/md";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  hoverRevealGroup,
  hoverRevealTarget,
} from "@plugins/primitives/plugins/hover-reveal/web";

interface ResizeHandleProps {
  onResize: (dx: number) => void;
  onCollapse?: () => void;
}

// Pointer-driven resize handle: a rigid (`shrink-0`) 1px grab strip in
// miller's column flex row, with a pixel-positioned divider line and a
// centered collapse affordance — JS/pixel coordinate territory, not Pin.
/* eslint-disable layout/no-adhoc-layout -- pointer-driven resize handle: rigid grab strip in miller's row, collapse button pinned/centered over it */
const handleClass = cn(
  hoverRevealGroup,
  "relative w-1 shrink-0 cursor-col-resize",
);
const collapseButtonClass = cn(
  hoverRevealTarget,
  "absolute left-1/2 top-2 z-raised flex size-5 -translate-x-1/2 items-center justify-center rounded-md border bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
);
/* eslint-enable layout/no-adhoc-layout */

export function ResizeHandle({ onResize, onCollapse }: ResizeHandleProps) {
  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      // Capture the pointer on the handle: without it, moving over an
      // <iframe> (e.g. a prototype canvas frame) routes the pointer events to
      // the iframe's own document and the drag stalls until the cursor leaves
      // it. With capture every move lands here, whatever is underneath.
      const handle = e.currentTarget;
      const { pointerId } = e;
      handle.setPointerCapture(pointerId);
      let lastX = e.clientX;
      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        const dx = ev.clientX - lastX;
        lastX = ev.clientX;
        if (dx !== 0) onResize(dx);
      };
      // lostpointercapture fires after pointerup / pointercancel too, and when
      // capture is dropped any other way — one exit for every drag end.
      const onEnd = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("lostpointercapture", onEnd);
      };
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("lostpointercapture", onEnd);
    },
    [onResize],
  );

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onPointerDown={onPointerDown}
      className={handleClass}
      style={{ touchAction: "none" }}
    >
      {/* eslint-disable-next-line layout/no-adhoc-layout -- pixel-wide divider line centered over the drag strip */}
      <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border group-hover/hover-reveal:bg-primary/40" />
      {onCollapse && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onCollapse();
          }}
          aria-label="Collapse column"
          className={collapseButtonClass}
        >
          <MdChevronLeft className="size-3" />
        </button>
      )}
    </div>
  );
}
