import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type React from "react";

/** Which axis (or both) to clip. */
export type ClipAxis = "both" | "x" | "y";

const CLIP_CLASS: Record<ClipAxis, string> = {
  both: "overflow-hidden",
  x: "overflow-x-hidden",
  y: "overflow-y-hidden",
};

/**
 * The pure clip + fill class map — single source of truth, exported so the
 * component and the pure test share one definition. `fill` adds the same
 * axis-aware flex-child fill pair `Scroll` uses: `min-w-0 flex-1` on the `x`
 * axis, `min-h-0 flex-1` otherwise — for a clipped pane that must fill its flex
 * parent.
 */
export function clipClasses(opts: { axis: ClipAxis; fill: boolean }): string {
  return [
    CLIP_CLASS[opts.axis],
    opts.fill ? (opts.axis === "x" ? "min-w-0 flex-1" : "min-h-0 flex-1") : null,
  ]
    .filter(Boolean)
    .join(" ");
}

export interface ClipProps extends React.HTMLAttributes<HTMLElement> {
  /** Which axis to clip. Defaults to `both`. */
  axis?: ClipAxis;
  /** Emit the flex-child fill pair (`min-h-0 flex-1`, or `min-w-0 flex-1` on the
   *  `x` axis) so the clipped pane fills its flex parent. Defaults to false. */
  fill?: boolean;
  /** Host element/component. Defaults to a `div`. */
  as?: React.ElementType;
  /** Forwarded to the rendered element (mirrors Surface/Card/Row). */
  ref?: React.Ref<HTMLElement>;
}

/**
 * The sanctioned clipping primitive — hides overflow WITHOUT scrolling, the
 * `overflow-hidden` sibling of `<Scroll>`. Kept orthogonal: Scroll owns
 * scrollable overflow, Clip owns clipped overflow.
 *
 * Decoration stays in `className` — `rounded-*` / `border` are not banned, so a
 * rounded-clipped media box is `<Clip className="rounded-md border">`.
 *
 * NOT for single-line text truncation (`overflow-hidden text-ellipsis
 * whitespace-nowrap`) — that is `<Text>` inside a line container (the dedicated
 * truncation leaf). Clip is purely the box-level clipping mechanic.
 *
 * Caller `className` composes last.
 */
export function Clip({
  axis = "both",
  fill = false,
  as: As = "div",
  ref,
  className,
  children,
  ...rest
}: ClipProps) {
  return (
    <As ref={ref} className={cn(clipClasses({ axis, fill }), className)} {...rest}>
      {children}
    </As>
  );
}
