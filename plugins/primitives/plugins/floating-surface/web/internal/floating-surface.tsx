import { useEffect, useMemo, useState } from "react";
import {
  useFloating,
  offset,
  flip,
  shift,
  size,
  autoUpdate,
  type Placement,
} from "@floating-ui/react-dom";
import {
  cn,
  POPOVER_WIDTH,
  POPOVER_PADDING,
  POPOVER_MAX_HEIGHT,
  type PopoverWidth,
  type PopoverPadding,
  type PopoverMaxHeight,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { ViewportOverlay } from "@plugins/primitives/plugins/css/plugins/viewport-overlay/web";
import { Surface } from "@plugins/primitives/plugins/css/plugins/surface/web";
import { OverlayBoundary } from "@plugins/primitives/plugins/overlay-boundary/web";

/**
 * A FOCUS-LESS, caret-anchored floating surface.
 *
 * It positions a panel against a transient **virtual anchor** (a caret/selection
 * rect, or any `{ getBoundingClientRect }` virtual element) via Floating UI — and
 * **never touches focus**. This is what sets it apart from base-ui's `Popover`:
 * a trigger popover *should* move focus into its panel, but a caret menu must keep
 * the caret live in the host contenteditable (Lexical drives navigation; rows
 * `preventDefault` on mousedown to keep focus). Bending `Popover.Root`'s focus
 * management off would fight its abstraction, so this is a **sibling** primitive,
 * not an extension of it — exactly the stance `format-toolbar-plugin` already takes.
 *
 * It composes the same VISUAL primitives that sit one layer below base-ui's
 * Popover — `ViewportOverlay` (portal to document.body + z-layer + theme-scope,
 * click-through) wrapping a `<Surface level="overlay">` with the shared
 * `POPOVER_WIDTH` / `POPOVER_PADDING` / `POPOVER_MAX_HEIGHT` roles — so the chrome
 * is byte-identical to a real popover. Floating UI is the same engine base-ui's
 * Positioner uses internally; here we use it directly, minus the focus/dismiss
 * wrapper, and gain flip + scroll-follow for free.
 *
 * Positioning is returned as an inline `style` object (`floatingStyles`), so it is
 * the only `fixed` in the tree and is invisible to `layout/no-adhoc-layout` (which
 * only scans `className` strings) — no eslint-disable anywhere.
 */

/** Caret/selection rect, or any object exposing one (a Floating UI virtual element). */
export type FloatingAnchor = DOMRect | { getBoundingClientRect: () => DOMRect };

export interface FloatingSurfaceProps {
  /** Whether the surface is shown. Returns `null` when false (or `anchor` is null). */
  open: boolean;
  /** The caret/selection rect or virtual element the surface anchors to. */
  anchor: FloatingAnchor | null;
  children: React.ReactNode;
  /** Width role (default `"content"` — size to content). */
  width?: PopoverWidth;
  /** Padding role (default `"xs"`). */
  padding?: PopoverPadding;
  /** Max-height role; owns `max-h-*` + `overflow-y-auto` (default `"none"`). */
  maxHeight?: PopoverMaxHeight;
  /** Preferred side of the anchor (default `"bottom"`). Flips on collision. */
  side?: "top" | "right" | "bottom" | "left";
  /** Alignment along the chosen side (default `"start"`). */
  align?: "start" | "center" | "end";
  /** Gap between the anchor and the surface, in px (default `4`). */
  sideOffset?: number;
  /** Opt-in focus-safe outside-press close (never preventDefaults or focuses). */
  onDismiss?: () => void;
  /**
   * Identity change re-runs Floating UI `update()` — pass the host's live query
   * string when keystroke caret-follow needs to be tighter than `autoUpdate`'s
   * scroll/resize cadence.
   */
  reposition?: unknown;
}

/** A DOMRect anchor is wrapped into a virtual element; a virtual element passes through. */
function toVirtualElement(anchor: FloatingAnchor): {
  getBoundingClientRect: () => DOMRect;
} {
  if (anchor instanceof DOMRect) {
    return { getBoundingClientRect: () => anchor };
  }
  return anchor;
}

/** Maps the side+align prop pair to a Floating UI placement string. */
function toPlacement(
  side: NonNullable<FloatingSurfaceProps["side"]>,
  align: NonNullable<FloatingSurfaceProps["align"]>,
): Placement {
  return align === "center" ? side : (`${side}-${align}` as Placement);
}

export function FloatingSurface({
  open,
  anchor,
  children,
  width = "content",
  padding = "xs",
  maxHeight = "none",
  side = "bottom",
  align = "start",
  sideOffset = 4,
  onDismiss,
  reposition,
}: FloatingSurfaceProps) {
  // The floating node is tracked as STATE via a callback ref (a `useState`
  // setter), not a React ref — so nothing reads a ref during render (the strict
  // `react-hooks/refs` rule). The reference is a CONTROLLED virtual element:
  // callers pass a fresh `caretAnchor()` each render, so `anchor` identity changes
  // as the caret moves and Floating UI re-positions; `autoUpdate` covers scroll/resize.
  const [floatingEl, setFloatingEl] = useState<HTMLElement | null>(null);
  const reference = useMemo(
    () => (anchor ? toVirtualElement(anchor) : null),
    [anchor],
  );

  const { floatingStyles, update } = useFloating({
    open,
    strategy: "fixed",
    placement: toPlacement(side, align),
    whileElementsMounted: autoUpdate,
    elements: { reference, floating: floatingEl },
    middleware: [
      offset(sideOffset),
      flip(),
      shift({ padding: 8 }),
      size({
        apply({ availableWidth, availableHeight, elements }) {
          // Reproduce the CSS vars base-ui's Positioner exposes, so the
          // `max-w-(--available-width)` width roles keep working unchanged.
          elements.floating.style.setProperty(
            "--available-width",
            `${availableWidth}px`,
          );
          elements.floating.style.setProperty(
            "--available-height",
            `${availableHeight}px`,
          );
        },
      }),
    ],
  });

  // Explicit reposition nudge for hosts that memoize their anchor (an inline
  // `caretAnchor()` already re-positions via the controlled `reference` above).
  useEffect(() => {
    if (open) update();
  }, [open, reposition, update]);

  // Focus-safe outside-press close: a capture-phase document listener that closes
  // on a press outside the surface. It never preventDefaults and never focuses
  // anything, so the caret stays live in the host.
  useEffect(() => {
    if (!open || !onDismiss) return;
    const dismiss = onDismiss;
    function onPointerDown(e: PointerEvent) {
      if (floatingEl && floatingEl.contains(e.target as Node)) return;
      dismiss();
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open, onDismiss, floatingEl]);

  if (!open || !anchor) return null;

  // Surface forwards both `ref` (explicit `React.Ref<HTMLElement>` prop) and
  // `style` (via its `{...rest}` passthrough), so the `setFloatingEl` callback ref
  // and positioning go straight to it — no wrapper div. The host never needs the
  // surface node: outside-press containment is owned here.
  return (
    <ViewportOverlay layer="popover" className="pointer-events-none">
      <Surface
        ref={setFloatingEl}
        level="overlay"
        style={floatingStyles}
        className={cn(
          "pointer-events-auto",
          POPOVER_WIDTH[width],
          POPOVER_PADDING[padding],
          POPOVER_MAX_HEIGHT[maxHeight],
        )}
      >
        <OverlayBoundary kind="floating">{children}</OverlayBoundary>
      </Surface>
    </ViewportOverlay>
  );
}
