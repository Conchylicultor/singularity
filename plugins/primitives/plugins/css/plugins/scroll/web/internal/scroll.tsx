import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type React from "react";

/**
 * Which axis (or axes) scrolls. `y` and `x` clamp the perpendicular axis to
 * `hidden` so a vertical scroller never grows a stray horizontal bar (and vice
 * versa); `both` opens both axes.
 */
export type ScrollAxis = "y" | "x" | "both";

const OVERFLOW_CLASS: Record<ScrollAxis, string> = {
  y: "overflow-y-auto overflow-x-hidden",
  x: "overflow-x-auto overflow-y-hidden",
  both: "overflow-auto",
};

/**
 * The pure overflow + fill class map — the single source of truth for Scroll's
 * geometry, exported so the component and the pure test share one definition.
 *
 * `fill` emits the flex-child fill pair as ONE concern: a scroll pane inside a
 * flex column must be both `flex-1` (claim the leftover main-axis space) AND
 * `min-h-0` (allow shrinking below content height so the overflow actually
 * engages). Splitting `min-h-0` out re-exposes the "pane grows past its parent,
 * the whole page scrolls instead" footgun — so they live together. On a
 * horizontal scroller (`axis: "x"`) the same role is `min-w-0 flex-1`.
 */
export function scrollClasses(opts: {
  axis: ScrollAxis;
  fill: boolean;
  hideScrollbar: boolean;
  isolate: boolean;
}): string {
  return [
    OVERFLOW_CLASS[opts.axis],
    opts.fill ? (opts.axis === "x" ? "min-w-0 flex-1" : "min-h-0 flex-1") : null,
    opts.hideScrollbar ? "no-scrollbar" : null,
    opts.isolate ? "isolate" : null,
  ]
    .filter(Boolean)
    .join(" ");
}

export interface ScrollProps extends React.HTMLAttributes<HTMLElement> {
  /** Which axis scrolls. Defaults to `y`. */
  axis?: ScrollAxis;
  /** Emit the flex-child fill pair (`min-h-0 flex-1`, or `min-w-0 flex-1` on the
   *  `x` axis) so the pane fills its flex parent and the overflow engages.
   *  Defaults to false. */
  fill?: boolean;
  /** Hide the scrollbar chrome while keeping the content scrollable
   *  (`no-scrollbar`). Defaults to false. */
  hideScrollbar?: boolean;
  /** Open a new stacking context (`isolate`) so descendant z-layers can't escape
   *  the pane. Defaults to false. */
  isolate?: boolean;
  /** Host element/component. Defaults to a `div`. */
  as?: React.ElementType;
}

/**
 * The sanctioned scroll-container primitive — owns overflow AND the flex-child
 * fill policy as a single role, the combination ~100 call sites re-derived by
 * hand as `min-h-0 flex-1 overflow-y-auto`. Supersedes the old "a genuine scroll
 * container is the canonical eslint-disable" guidance: reach for `<Scroll>`.
 *
 * Sizing stays in the caller's `className` — `h-*`/`max-h-*` are not banned, so a
 * fixed-height scroller is `<Scroll className="max-h-96">` and a full-height one
 * is `<Scroll className="h-full">`. The primitive owns only the overflow + fill
 * mechanics; the box's extent is the caller's concern.
 *
 * Caller `className` composes last.
 */
export function Scroll({
  axis = "y",
  fill = false,
  hideScrollbar = false,
  isolate = false,
  as: As = "div",
  className,
  children,
  ...rest
}: ScrollProps) {
  return (
    <As
      className={cn(scrollClasses({ axis, fill, hideScrollbar, isolate }), className)}
      {...rest}
    >
      {children}
    </As>
  );
}
