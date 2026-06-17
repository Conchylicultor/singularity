import { cn } from "@plugins/primitives/plugins/ui-kit/web";
import type React from "react";

export type CenterAxis = "both" | "horizontal" | "vertical";

const AXIS_CLASS: Record<CenterAxis, string> = {
  both: "place-items-center",
  horizontal: "justify-items-center",
  vertical: "items-center",
};

export interface CenterProps extends React.HTMLAttributes<HTMLElement> {
  /** Which axes to center on. Defaults to `both`. */
  axis?: CenterAxis;
  /** Host element/component. Defaults to a `div`. */
  as?: React.ElementType;
}

/**
 * Centering box — the ubiquitous "center this content" one-liner, expressed once
 * as a role instead of re-derived per call site. Implemented as a CSS grid so a
 * single `place-items-center` declaration centers both axes with no flex
 * child-stretch surprises (a flex parent silently stretches its child on the
 * cross axis; a grid place-items box does not).
 *
 * Scope is deliberately ONLY the flex/grid centering box. Block-centering a
 * constrained element with `mx-auto` / `my-auto` is already allowed by the
 * spacing rules and intentionally NOT this primitive's job — keeping Center to
 * the `place-items` case keeps the layout set orthogonal (each primitive owns
 * one distinct mechanic, no overlap).
 *
 * Caller `className` composes last.
 */
export function Center({
  axis = "both",
  as: As = "div",
  className,
  children,
  ...rest
}: CenterProps) {
  return (
    <As className={cn("grid", AXIS_CLASS[axis], className)} {...rest}>
      {children}
    </As>
  );
}
