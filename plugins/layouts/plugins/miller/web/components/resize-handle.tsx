import { useCallback, type PointerEvent as ReactPointerEvent } from "react";
import { MdChevronLeft } from "react-icons/md";

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
      className="group relative w-1 shrink-0 cursor-col-resize"
      style={{ touchAction: "none" }}
    >
      <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border group-hover:bg-primary/40" />
      {onCollapse && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onCollapse();
          }}
          aria-label="Collapse column"
          className="absolute left-1/2 top-2 z-raised flex size-5 -translate-x-1/2 items-center justify-center rounded-md border bg-background text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground group-hover:opacity-100"
        >
          <MdChevronLeft className="size-3" />
        </button>
      )}
    </div>
  );
}
