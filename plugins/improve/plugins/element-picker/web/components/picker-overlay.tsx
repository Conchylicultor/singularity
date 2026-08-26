import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  Placed,
  placedClasses,
  placedStyle,
} from "@plugins/primitives/plugins/css/plugins/coords/web";
import { useEffect, useState } from "react";
import { Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { ViewportOverlay } from "@plugins/primitives/plugins/css/plugins/viewport-overlay/web";
import { collectLineage } from "@plugins/primitives/plugins/ui-context/web";
import { resolveTarget } from "../internal/resolve-target";

interface Highlight {
  rect: DOMRect;
  pluginId?: string;
  tag: string;
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
      const nodes = collectLineage(el);
      setHighlight({
        rect: el.getBoundingClientRect(),
        pluginId: nodes[nodes.length - 1]?.pluginId,
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
    <ViewportOverlay
      layer="max"
      data-element-picker
      className="pointer-events-none"
    >
      {highlight && (
        <>
          <Placed
            decorative
            x={{ start: highlight.rect.left, size: highlight.rect.width }}
            y={{ start: highlight.rect.top, size: highlight.rect.height }}
            className="bg-primary/10 border-primary border-2"
          />
          {/* The label is an `Inset`, so the placement arrives as the class +
              style helpers rather than a wrapper. */}
          <Inset
            x="2xs"
            y="none"
            className={cn(
              placedClasses({ decorative: true }),
              "bg-primary text-primary-foreground rounded-sm text-caption whitespace-nowrap",
            )}
            style={placedStyle(
              { start: highlight.rect.left },
              { start: Math.max(0, highlight.rect.top - 22) },
            )}
          >
            {highlight.pluginId ? `${highlight.pluginId} · ` : ""}
            {highlight.tag}
          </Inset>
        </>
      )}

      <Pin to="bottom" decorative style={{ bottom: "1rem" }}>
        <Inset
          x="sm"
          y="xs"
          className="bg-background/95 border-border text-foreground rounded-md border text-label shadow-lg backdrop-blur"
        >
          Click an element to attach it as context · Esc to cancel
        </Inset>
      </Pin>
    </ViewportOverlay>
  );
}
