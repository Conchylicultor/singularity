import { useEffect, useState } from "react";
import { Inset } from "@plugins/primitives/plugins/spacing/web";
import { collectMarkerLineage } from "../internal/marker-lineage";

interface Highlight {
  rect: DOMRect;
  pluginId?: string;
  tag: string;
}

/** Resolve the real element under the pointer, skipping picker chrome. */
function resolveTarget(x: number, y: number): Element | null {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  if (el.closest("[data-element-picker]")) return null;
  return el;
}

export function PickerOverlay({
  onPick,
  onCancel,
}: {
  onPick: (el: Element) => void;
  onCancel: () => void;
}) {
  const [highlight, setHighlight] = useState<Highlight | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const el = resolveTarget(e.clientX, e.clientY);
      if (!el) {
        setHighlight(null);
        return;
      }
      const markers = collectMarkerLineage(el).markers;
      setHighlight({
        rect: el.getBoundingClientRect(),
        pluginId: markers[markers.length - 1]?.pluginId,
        tag: el.tagName.toLowerCase(),
      });
    };

    // Swallow the press itself (capture phase, before it reaches the document).
    // Picking is often launched from inside an open popover; without this the
    // press on the underlying app element reads as an outside-press and dismisses
    // the popover (and moves focus out of it) before the chip is injected.
    // preventDefault also keeps focus on the popover so no focus-out dismissal
    // fires. The actual pick happens on the subsequent `click`.
    const onDown = (e: MouseEvent) => {
      const el = resolveTarget(e.clientX, e.clientY);
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
    };

    const onClick = (e: MouseEvent) => {
      const el = resolveTarget(e.clientX, e.clientY);
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      onPick(el);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    };

    window.addEventListener("mousemove", onMove, true);
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("mousemove", onMove, true);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onPick, onCancel]);

  return (
    // pointer-events:none so document.elementFromPoint returns the underlying
    // app element rather than this overlay.
    <div
      data-element-picker
      className="fixed inset-0 z-max"
      style={{ pointerEvents: "none" }}
    >
      {highlight && (
        <>
          <div
            className="bg-primary/10 border-primary pointer-events-none absolute border-2"
            style={{
              left: highlight.rect.left,
              top: highlight.rect.top,
              width: highlight.rect.width,
              height: highlight.rect.height,
            }}
          />
          <Inset
            x="2xs"
            y="none"
            className="bg-primary text-primary-foreground pointer-events-none absolute rounded-sm text-caption whitespace-nowrap"
            style={{
              left: highlight.rect.left,
              top: Math.max(0, highlight.rect.top - 22),
            }}
          >
            {highlight.pluginId ? `${highlight.pluginId} · ` : ""}
            {highlight.tag}
          </Inset>
        </>
      )}

      <Inset
        x="sm"
        y="xs"
        className="bg-background/95 border-border text-foreground pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-md border text-label shadow-lg backdrop-blur"
      >
        Click an element to attach it as context · Esc to cancel
      </Inset>
    </div>
  );
}
