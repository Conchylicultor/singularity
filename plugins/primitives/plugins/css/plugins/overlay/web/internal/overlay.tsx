import { cn } from "@plugins/primitives/plugins/ui-kit/web";
import type React from "react";
import type { ReactNode } from "react";

/**
 * The closed stacking-layer set for an Overlay box, named off the semantic
 * z-layer scale. z-layers exposes no web barrel, so — exactly like
 * `viewport-overlay`'s local `LAYER_CLASS` — the map lives here and resolves each
 * role to the existing named `z-*` utility. NEVER a raw z-number.
 */
export type OverlayLayer = "base" | "raised" | "nav" | "float" | "overlay";

const LAYER_CLASS: Record<OverlayLayer, string> = {
  base: "z-base",
  raised: "z-raised",
  nav: "z-nav",
  float: "z-float",
  overlay: "z-overlay",
};

export interface OverlayProps
  extends React.HTMLAttributes<HTMLElement> {
  /** Full-bleed layer filling the box (`absolute inset-0`), painted BEHIND
   *  `children`. Typically a background or a click target (a toggle button). */
  behind?: ReactNode;
  /** Full-bleed layer painted ABOVE `children` (badges, hover scrims, gradients).
   *  Always `pointer-events-none` so a decorative layer never eats clicks. */
  above?: ReactNode;
  /** In-flow content; establishes the box's natural size. Required. */
  children: ReactNode;
  /** Stacking level of the WHOLE box among its siblings, from the z-layer scale.
   *  Defaults to `base`. (The internal behind/children/above order is structural,
   *  not z-driven.) */
  layer?: OverlayLayer;
  /** When `behind` is a click target, set true so `children` are click-through
   *  (`pointer-events-none`) and clicks fall through to `behind`. Interactive
   *  bits inside `children` opt back in with `<Overlay.Interactive>`. Default false. */
  clickThrough?: boolean;
  /** Host element/component. Defaults to a `div`. */
  as?: React.ElementType;
}

/**
 * The pointer-events opt-in for interactive content sitting over a click-through
 * layer. A child of a `clickThrough` Overlay (or of an `above` layer, which is
 * always pointer-events-none) is inert by default; wrap the interactive bit in
 * `<Overlay.Interactive>` to re-enable pointer events on just that subtree.
 * Replaces the bespoke hand-rolled `pointer-events-auto relative` pair.
 */
export function OverlayInteractive({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative pointer-events-auto", className)}>
      {children}
    </div>
  );
}

/**
 * The sanctioned IN-FLOW positioning primitive: establishes a positioning
 * context (`relative`) on its own box and paints full-bleed `behind` / `above`
 * layers around its in-flow `children`. Pairs with — does NOT replace —
 * `viewport-overlay` (which portals to `<body>` for a true `fixed inset-0`):
 * Overlay is for positioning WITHIN a box, so it uses `absolute inset-0` only,
 * never `fixed inset-0` (that would be viewport-overlay's territory and trip its
 * lint rule).
 *
 * ## Structural stacking, not z-index soup
 *
 * The internal paint order — `behind` < `children` < `above` — is STRUCTURAL,
 * established by DOM order, not by per-layer z-index. `behind` is painted first
 * (under the content), `above` last. The `layer` prop is orthogonal: it sets the
 * stacking level of the WHOLE box among its siblings, not the order inside it.
 *
 * - `above` is always `pointer-events-none` so a decorative full-bleed scrim,
 *   gradient, or badge layer can never eat clicks meant for the content beneath.
 * - `clickThrough` makes `children` `pointer-events-none` so clicks fall through
 *   to a `behind` click-target — the CollapsibleCard toggle idiom: the whole
 *   header is one big toggle button behind, the header content rides on top
 *   click-through, and the few interactive bits (a file path, row actions) opt
 *   back in with `<Overlay.Interactive>`.
 *
 * Caller `className` composes last.
 */
function OverlayRoot({
  behind,
  above,
  children,
  layer = "base",
  clickThrough = false,
  as: As = "div",
  className,
  ...rest
}: OverlayProps) {
  return (
    <As className={cn("relative", LAYER_CLASS[layer], className)} {...rest}>
      {behind != null && <div className="absolute inset-0">{behind}</div>}
      <div className={cn("relative", clickThrough && "pointer-events-none")}>
        {children}
      </div>
      {above != null && (
        <div className="absolute inset-0 pointer-events-none">{above}</div>
      )}
    </As>
  );
}

/**
 * `Overlay` is the root box with `Overlay.Interactive` attached as a static
 * member (the `Object.assign` compound-component pattern this codebase already
 * uses, so TS accepts the static property).
 */
export const Overlay = Object.assign(OverlayRoot, {
  Interactive: OverlayInteractive,
});
