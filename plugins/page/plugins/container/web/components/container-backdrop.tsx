import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

/**
 * The positioned box a container's `Editor.BlockFrame` paints — the callout's
 * tint, the context card's dashed border — covering the container's own row AND
 * every block nested inside it.
 *
 * The primitive owns the GEOMETRY; the consumer passes appearance classes only.
 * That split is what makes the three documented frame rules
 * (`BlockFrameProps`) true by construction instead of by review:
 *
 * - **Fills the surface-provided box with `absolute` insets**, starting at
 *   `inset` — the editor's already-resolved content edge `C`, so the decoration
 *   bleeds to `C` (never over the hover rail) and is 0 on surfaces with no rail.
 * - **Never `h-full`**: an explicit height would defeat the editor's grid
 *   stretch, and any vertical bleed would shift the box instead of growing it.
 *   `top: 0` / `bottom: 0` cover exactly the rows spanned — no breathing-room
 *   bleed, which a backdrop cannot buy anyway (it would overlap the next block
 *   rather than displace it; every row already carries its own `py-xs`).
 * - **No horizontal offset beyond `inset`**: the rows inside seat their hover
 *   controls against a content edge the SURFACE computed, so shifting the flow
 *   would strand them.
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
 * sanctioned interactive companion is the anchor decoration.
 */
export function ContainerBackdrop({
  inset,
  className,
}: {
  /** `BlockFrameProps.inset`: px from the frame box's left edge to `C`. */
  inset: number;
  /** Appearance only — background / border / radius. Never layout or spacing. */
  className?: string;
}) {
  return (
    <div
      // eslint-disable-next-line layout/no-adhoc-layout -- a backdrop filling the surface-provided positioned box, offset by a JS-computed left inset; not a ramp-expressible anchor
      className={cn("absolute", className)}
      style={{ left: inset, right: 0, top: 0, bottom: 0 }}
    />
  );
}
