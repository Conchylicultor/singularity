import type { OverlayLayer } from "@plugins/primitives/plugins/css/plugins/overlay/web";
import type { SpaceStep } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type React from "react";

/**
 * Layer name→class map, copied locally like `overlay`/`sticky` (z-layers has no
 * web barrel). NEVER a raw z-*.
 */
const LAYER_CLASS: Record<OverlayLayer, string> = {
  base: "z-base",
  raised: "z-raised",
  nav: "z-nav",
  float: "z-float",
  overlay: "z-overlay",
};

/**
 * Where the pinned child anchors inside its `relative` parent: a corner, an
 * edge-center, or dead center.
 */
export type PinAnchor =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "center";

/**
 * Resolve a `SpaceStep` inset distance to a CSS length, optionally negated for an
 * `outset` (the badge that overhangs its corner, `-top-1 -right-1`). The semantic
 * ramp has no inset utilities, so — like `sticky` — the distance is an inline
 * style reading the density `--space-*` var. `none` is a literal `0`.
 */
function edgeLength(step: SpaceStep, outset: boolean): string {
  if (step === "none") return "0";
  const v = `var(--space-${step})`;
  return outset ? `calc(${v} * -1)` : v;
}

/**
 * Pure class + style map for a pinned child — single source of truth, exported
 * so the component and the pure test share one definition.
 *
 * `absolute` + the stacking layer are always classes. Per anchor:
 * - **corners** pin both adjacent edges via inline-style insets (no class).
 * - **edge-centers** pin that edge (inline style) and, on the perpendicular axis,
 *   either center it (`left-1/2 -translate-x-1/2` — pure Tailwind classes) or, when
 *   `stretch`, span it full-length (`inset-x-0` / `inset-y-0`).
 * - **center** is the four-class translate centering trick; `offset` is ignored.
 *
 * The translate/`1/2` centering mechanics are pure Tailwind classes that live
 * inside this exempt primitive so callers never write them.
 */
export function pinClasses(opts: {
  to: PinAnchor;
  offset: SpaceStep;
  outset: boolean;
  layer: OverlayLayer;
  decorative: boolean;
  stretch: boolean;
}): { className: string; style: React.CSSProperties } {
  const classes = ["absolute", LAYER_CLASS[opts.layer]];
  if (opts.decorative) classes.push("pointer-events-none");
  const style: React.CSSProperties = {};
  const len = edgeLength(opts.offset, opts.outset);

  switch (opts.to) {
    case "top-left":
      style.top = len;
      style.left = len;
      break;
    case "top-right":
      style.top = len;
      style.right = len;
      break;
    case "bottom-left":
      style.bottom = len;
      style.left = len;
      break;
    case "bottom-right":
      style.bottom = len;
      style.right = len;
      break;
    case "top":
      style.top = len;
      classes.push(opts.stretch ? "inset-x-0" : "left-1/2 -translate-x-1/2");
      break;
    case "bottom":
      style.bottom = len;
      classes.push(opts.stretch ? "inset-x-0" : "left-1/2 -translate-x-1/2");
      break;
    case "left":
      style.left = len;
      classes.push(opts.stretch ? "inset-y-0" : "top-1/2 -translate-y-1/2");
      break;
    case "right":
      style.right = len;
      classes.push(opts.stretch ? "inset-y-0" : "top-1/2 -translate-y-1/2");
      break;
    case "center":
      classes.push("top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2");
      break;
  }

  return { className: classes.join(" "), style };
}

export interface PinProps extends React.HTMLAttributes<HTMLElement> {
  /** Where to anchor inside the `relative` parent. Required. */
  to: PinAnchor;
  /** Inset from the anchored edge(s), from the spacing ramp. Default `none`.
   *  Ignored for `to="center"`. */
  offset?: SpaceStep;
  /** Negate the offset so the child overhangs the corner/edge (a badge that pokes
   *  out, `-top-1 -right-1`). Default false. */
  outset?: boolean;
  /** Stacking level among siblings, from the z-layer scale. Default `raised`. */
  layer?: OverlayLayer;
  /** Make the child click-through (`pointer-events-none`) — a decorative overlay
   *  that must never eat clicks. Default false. */
  decorative?: boolean;
  /** For an edge-center anchor, span the perpendicular axis full-length
   *  (`inset-y-0` for left/right, `inset-x-0` for top/bottom) instead of centering
   *  it. Default false. No effect on corners or center. */
  stretch?: boolean;
  /** Host element/component. Defaults to a `div`. */
  as?: React.ElementType;
}

/**
 * The sanctioned point-anchored absolute-positioning primitive — places a child
 * at a corner / edge-center / center of a caller-owned `relative` parent, the
 * `absolute top-1 right-1` family ~150 call sites wrote by hand.
 *
 * Sibling of `<Overlay>`, NOT an extension of it: Overlay stays pristine
 * (full-bleed `inset-0` layers only); Pin is the *point* anchor. The parent must
 * establish the positioning context (`relative` is not banned) — Pin only places
 * itself within it.
 *
 * Use Pin only for offsets expressible on the semantic ramp. JS/pixel/fractional
 * coordinates (drag handles, canvas overlays, floating-UI popovers) are NOT this
 * primitive's job — those keep a per-site `// eslint-disable -- reason`.
 *
 * Caller `className` composes last; caller `style` overrides the anchor insets.
 */
export function Pin({
  to,
  offset = "none",
  outset = false,
  layer = "raised",
  decorative = false,
  stretch = false,
  as: As = "div",
  className,
  style,
  children,
  ...rest
}: PinProps) {
  const pin = pinClasses({ to, offset, outset, layer, decorative, stretch });
  return (
    <As
      className={cn(pin.className, className)}
      style={{ ...pin.style, ...style }}
      {...rest}
    >
      {children}
    </As>
  );
}
