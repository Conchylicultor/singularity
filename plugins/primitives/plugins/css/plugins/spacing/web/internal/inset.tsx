import {
  rampClass,
  type SpaceStep,
} from "@plugins/primitives/plugins/css/plugins/space-ramp/core";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type React from "react";

export interface InsetSides {
  /** Padding on all sides. */
  pad?: SpaceStep;
  /** Horizontal padding (overrides `pad` on the X axis). */
  x?: SpaceStep;
  /** Vertical padding (overrides `pad` on the Y axis). */
  y?: SpaceStep;
  /** Single-side padding (overrides `pad`/`x`/`y`). */
  t?: SpaceStep;
  r?: SpaceStep;
  b?: SpaceStep;
  l?: SpaceStep;
}

/**
 * Resolve ramp steps to their padding utility classes, general→specific. For
 * consumers that can only take a `className` string (Lexical ContentEditable,
 * `<Text>`, third-party props) and therefore cannot wrap in `<Inset>`. Prefer
 * `<Inset>` when you control the element.
 */
export function insetClass({ pad, x, y, t, r, b, l }: InsetSides): string {
  return cn(
    pad && rampClass("p", pad),
    x && rampClass("px", x),
    y && rampClass("py", y),
    t && rampClass("pt", t),
    r && rampClass("pr", r),
    b && rampClass("pb", b),
    l && rampClass("pl", l),
  );
}

export interface InsetProps
  extends React.HTMLAttributes<HTMLElement>, InsetSides {
  /** Host element/component. Defaults to a `div`. */
  as?: React.ElementType;
  /** Forwarded to the rendered element (mirrors Surface/Card/Row). */
  ref?: React.Ref<HTMLElement>;
}

/**
 * Padding container drawn from the closed spacing ramp. Replaces hand-written
 * `p-*`/`px-*`/`py-*`. Classes compose general→specific (`pad` then axis then
 * side) so a narrower prop wins; caller `className` composes last.
 */
export function Inset({
  pad,
  x,
  y,
  t,
  r,
  b,
  l,
  as: As = "div",
  ref,
  className,
  children,
  ...rest
}: InsetProps) {
  return (
    <As
      ref={ref}
      className={cn(insetClass({ pad, x, y, t, r, b, l }), className)}
      {...rest}
    >
      {children}
    </As>
  );
}
