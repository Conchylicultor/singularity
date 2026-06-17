import { snapBox, useSnapPreview } from "../hooks/use-snap";

/**
 * The live snap-zone preview: a translucent, theme-tinted highlight of where the
 * dragged window will land, painted over the desktop while a titlebar drag hovers
 * an armed edge/corner. Rendered as part of the floating placement's `Foreground`
 * (a sibling above all window containers), it reads the transient snap-preview
 * channel and positions itself with the SAME `snapBox` the snapped window will
 * adopt — so the preview is pixel-faithful to the result. Pointer-transparent and
 * animated between zones for a polished, native-feeling snap hint.
 */
export function SnapPreviewOverlay() {
  const zone = useSnapPreview();
  if (!zone) return null;
  return (
    // A genuine one-off: a within-surface positioned highlight box derived from a
    // snap zone — no layout primitive models a transient drag-preview overlay.
    <div
      aria-hidden
      // eslint-disable-next-line layout/no-adhoc-layout -- transient snap-zone preview box; positioned from snapBox(), no positioning primitive applies
      className="pointer-events-none absolute z-float rounded-lg border-2 border-primary/70 bg-primary/15 shadow-lg backdrop-blur-sm transition-all duration-150 ease-out"
      style={snapBox(zone)}
    />
  );
}
