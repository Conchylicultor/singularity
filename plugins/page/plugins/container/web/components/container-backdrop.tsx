import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  frameBoxLeft,
  type BlockFrameProps,
} from "@plugins/page/plugins/editor/web";

/**
 * The positioned box a container's `Editor.BlockFrame` paints — the callout's
 * tint, the annotation cards' wash — covering the container's own row AND every
 * block nested inside it.
 *
 * The primitive owns the GEOMETRY; the consumer passes appearance classes only.
 * That split is what makes the three documented frame rules
 * (`BlockFrameProps`) true by construction instead of by review:
 *
 * - **Fills the surface-provided box with `absolute` insets**, at the box the
 *   surface measured: `frameBoxLeft(inset)` on the left and `rightInset` /
 *   `topInset` / `bottomInset` on the other three sides. That box is the
 *   container's own CONTENT box — the same one a code block's background and a
 *   place block's card already paint — so a card's edge lands on the same x as
 *   the first letter of the prose above it, and its content always stops one
 *   `FRAME_PAD` inside it on every side.
 * - **Never `h-full`**: an explicit height would defeat the editor's grid
 *   stretch, and any vertical bleed would shift the box instead of growing it.
 *   The three insets only ever pull the box IN, never out — the vertical
 *   breathing room is reserved by the ROWS (`framePadY` as their
 *   `padding-top`/`-bottom`), which a backdrop cannot buy for itself: growing
 *   upward would overlap the block above rather than displace it. What the
 *   insets do here is the NESTING share, so a card inside a card starts one pad
 *   below its parent instead of on the same y.
 * - **No horizontal offset of its own**: it takes the whole `BlockFrameProps`
 *   rather than a coordinate or two, so a consumer has nothing to add to and a
 *   later geometry field reaches every container without touching one of them.
 *
 * `className` is the appearance channel — background, border, radius — and its
 * "appearance only" contract is ENFORCED rather than merely documented: the
 * `no-adhoc-layout` / `no-adhoc-spacing` / `no-adhoc-radius` /
 * `no-adhoc-surface` rules all scan a `className` attribute, so a consumer that
 * reached for `absolute`, `inset-*`, `pl-*` or an off-scale radius is a lint
 * error at its own call site.
 *
 * A frame is a BACKDROP, not a wrapper: it takes no children and is painted
 * behind the rows it covers, which is what lets a block be indented into or out
 * of a container without its editor remounting. It is also `pointer-events-none`
 * and emitted BEFORE those rows, so it can carry no controls of its own — the
 * sanctioned interactive companion is the anchor decoration, which the surface
 * renders in the row layer (as a glyph in the box's own indent column, or as the
 * card's name in its top-right corner).
 */
export function ContainerBackdrop({
  frame,
  className,
}: {
  /** The surface's measured geometry, handed over whole. Never re-derived. */
  frame: BlockFrameProps;
  /** Appearance only — background / border / radius. Never layout or spacing. */
  className?: string;
}) {
  return (
    <div
      // eslint-disable-next-line layout/no-adhoc-layout -- a backdrop filling the surface-provided positioned box, offset by surface-computed left/right insets; not a ramp-expressible anchor
      className={cn("absolute", className)}
      style={{
        left: frameBoxLeft(frame.inset),
        right: frame.rightInset,
        top: frame.topInset,
        bottom: frame.bottomInset,
      }}
    />
  );
}
