import { useCallback, type PointerEvent as ReactPointerEvent } from "react";
import { MdChevronLeft } from "react-icons/md";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { hoverRevealGroup, hoverRevealTarget } from "@plugins/primitives/plugins/hover-reveal/web";

interface ResizeHandleProps {
  onResize: (dx: number) => void;
  onCollapse?: () => void;
}

export function ResizeHandle({ onResize, onCollapse }: ResizeHandleProps) {
  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      let lastX = e.clientX;
      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - lastX;
        lastX = ev.clientX;
        if (dx !== 0) onResize(dx);
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [onResize],
  );

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onPointerDown={onPointerDown}
      // Pointer-driven resize handle: a rigid (`shrink-0`) 1px grab strip in
      // miller's column flex row, with a pixel-positioned divider line and a
      // centered collapse affordance — JS/pixel coordinate territory, not Pin.
      // eslint-disable-next-line layout/no-adhoc-layout -- pointer-driven resize handle: rigid grab strip in miller's row
      className={cn(hoverRevealGroup, "relative w-1 shrink-0 cursor-col-resize")}
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
          // eslint-disable-next-line layout/no-adhoc-layout -- collapse button pinned/centered over the drag strip alongside the pixel-positioned line
          className={cn(hoverRevealTarget, "absolute left-1/2 top-2 z-raised flex size-5 -translate-x-1/2 items-center justify-center rounded-md border bg-background text-muted-foreground hover:bg-accent hover:text-foreground")}
        >
          <MdChevronLeft className="size-3" />
        </button>
      )}
    </div>
  );
}
