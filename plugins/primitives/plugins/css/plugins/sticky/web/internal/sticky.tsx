import type { OverlayLayer } from "@plugins/primitives/plugins/css/plugins/overlay/web";
import type { SpaceStep } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type React from "react";

/**
 * The closed stacking-layer set, named off the semantic z-layer scale. The
 * `OverlayLayer` *names* are reused from `overlay` (one source of truth for the
 * layer vocabulary), but the name→class map lives here — exactly like `overlay`
 * itself copies it — because `z-layers` exposes no web barrel. NEVER a raw z-*.
 */
const LAYER_CLASS: Record<OverlayLayer, string> = {
  base: "z-base",
  raised: "z-raised",
  nav: "z-nav",
  float: "z-float",
  overlay: "z-overlay",
};

/** Which edge of the scroll container the element sticks to. */
export type StickyEdge = "top" | "bottom" | "left" | "right";

/**
 * Resolve a `SpaceStep` to a CSS length. The semantic spacing ramp defines no
 * inset (`top-*`/`left-*`) utilities — only gap/padding — so the offset distance
 * is applied as an inline style reading the density `--space-*` var (the same
 * `gridTemplateColumns`-style escape `Grid` uses for what classes can't express).
 * `none` is a literal `0` (the ramp has no `--space-none` var; flush is the norm
 * for a sticky header).
 */
function spaceLength(step: SpaceStep): string {
  return step === "none" ? "0" : `var(--space-${step})`;
}

/**
 * Pure class + style map for a sticky element — single source of truth, exported
 * so the component and the pure test share one definition. The position type and
 * stacking level are classes; the edge offset distance is an inline style (no
 * inset utility exists for the semantic ramp).
 */
export function stickyClasses(opts: {
  edge: StickyEdge;
  offset: SpaceStep;
  layer: OverlayLayer;
}): { className: string; style: React.CSSProperties } {
  const len = spaceLength(opts.offset);
  const style: React.CSSProperties =
    opts.edge === "top"
      ? { top: len }
      : opts.edge === "bottom"
        ? { bottom: len }
        : opts.edge === "left"
          ? { left: len }
          : { right: len };
  return { className: `sticky ${LAYER_CLASS[opts.layer]}`, style };
}

export interface StickyProps extends React.HTMLAttributes<HTMLElement> {
  /** Which scroll edge to pin to. Defaults to `top`. */
  edge?: StickyEdge;
  /** Inset from the pinned edge, from the spacing ramp. Defaults to `none`
   *  (flush — `top-0` / `bottom-0` / …). */
  offset?: SpaceStep;
  /** Stacking level among siblings, from the z-layer scale. Defaults to `raised`
   *  (a sticky header sits above the content it scrolls over). */
  layer?: OverlayLayer;
  /** Host element/component. Defaults to a `div`. */
  as?: React.ElementType;
}

/**
 * The sanctioned sticky-positioning primitive — pins a header/footer/sidebar to
 * a scroll edge with a z-layer-aware stacking level, the `sticky top-0 z-raised`
 * combination ~24 call sites wrote by hand.
 *
 * Background and borders stay in `className` — `bg-*` / `border-*` /
 * `backdrop-blur` are not banned, so an opaque sticky header is `<Sticky
 * className="border-b bg-background">`.
 *
 * Caller `className` composes last; caller `style` overrides the edge offset.
 */
export function Sticky({
  edge = "top",
  offset = "none",
  layer = "raised",
  as: As = "div",
  className,
  style,
  children,
  ...rest
}: StickyProps) {
  const sticky = stickyClasses({ edge, offset, layer });
  return (
    <As
      className={cn(sticky.className, className)}
      style={{ ...sticky.style, ...style }}
      {...rest}
    >
      {children}
    </As>
  );
}
