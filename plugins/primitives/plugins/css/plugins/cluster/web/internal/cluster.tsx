import {
  Stack,
  type SpaceStep,
  type StackAlign,
  type StackJustify,
} from "@plugins/primitives/plugins/css/plugins/spacing/web";
import type React from "react";

export interface ClusterProps extends React.HTMLAttributes<HTMLElement> {
  /** Gap on both axes (wrap rows + chips), from the spacing ramp. Default `sm`. */
  gap?: SpaceStep;
  /** Cross-axis alignment. Default `center`. */
  align?: StackAlign;
  /** Main-axis distribution. */
  justify?: StackJustify;
  /** Host element/component. Defaults to a `div`. */
  as?: React.ElementType;
}

/**
 * Wrap-friendly chip group — a horizontal row of RIGID identity chips/tags that
 * wraps to the next line when it runs out of width. The semantic contract
 * Cluster adds over a bare `Stack direction="row" wrap` is the intent of its
 * children: they are identity chips — rigid, wrapping, and NEVER individually
 * shrinking. Cluster imposes no `min-w-0` anywhere (the truncation altitude is a
 * leaf's concern, never a chip group's), so a chip keeps its whole width and the
 * group reflows by wrapping rather than crushing.
 *
 * It DELEGATES to `Stack` internally rather than reimplementing flex, so the gap
 * ramp and align/justify semantics stay defined in exactly one place. The
 * distinct export earns its keep as the future home for chip-overflow policy: it
 * can later compose `ResponsiveOverflow` (progressively hide chips that don't
 * fit) with zero call-site change, because every chip group already routes
 * through this one primitive.
 *
 * Caller `className` composes last.
 */
export function Cluster({
  gap = "sm",
  align = "center",
  justify,
  as: As = "div",
  className,
  children,
  ...rest
}: ClusterProps) {
  return (
    <Stack
      direction="row"
      wrap
      align={align}
      justify={justify}
      gap={gap}
      as={As}
      className={className}
      {...rest}
    >
      {children}
    </Stack>
  );
}
