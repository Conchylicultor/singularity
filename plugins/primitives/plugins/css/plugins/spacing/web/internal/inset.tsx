import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type React from "react";

import type { SpaceStep } from "./stack";

// Per-axis/side class maps over the spacing ramp. Each entry is a `p*-<step>`
// `@utility` backed by the density `--space-*` vars.
const P_CLASS: Record<SpaceStep, string> = {
  none: "p-none", "2xs": "p-2xs", xs: "p-xs", sm: "p-sm", md: "p-md", lg: "p-lg", xl: "p-xl", "2xl": "p-2xl",
};
const PX_CLASS: Record<SpaceStep, string> = {
  none: "px-none", "2xs": "px-2xs", xs: "px-xs", sm: "px-sm", md: "px-md", lg: "px-lg", xl: "px-xl", "2xl": "px-2xl",
};
const PY_CLASS: Record<SpaceStep, string> = {
  none: "py-none", "2xs": "py-2xs", xs: "py-xs", sm: "py-sm", md: "py-md", lg: "py-lg", xl: "py-xl", "2xl": "py-2xl",
};
const PT_CLASS: Record<SpaceStep, string> = {
  none: "pt-none", "2xs": "pt-2xs", xs: "pt-xs", sm: "pt-sm", md: "pt-md", lg: "pt-lg", xl: "pt-xl", "2xl": "pt-2xl",
};
const PR_CLASS: Record<SpaceStep, string> = {
  none: "pr-none", "2xs": "pr-2xs", xs: "pr-xs", sm: "pr-sm", md: "pr-md", lg: "pr-lg", xl: "pr-xl", "2xl": "pr-2xl",
};
const PB_CLASS: Record<SpaceStep, string> = {
  none: "pb-none", "2xs": "pb-2xs", xs: "pb-xs", sm: "pb-sm", md: "pb-md", lg: "pb-lg", xl: "pb-xl", "2xl": "pb-2xl",
};
const PL_CLASS: Record<SpaceStep, string> = {
  none: "pl-none", "2xs": "pl-2xs", xs: "pl-xs", sm: "pl-sm", md: "pl-md", lg: "pl-lg", xl: "pl-xl", "2xl": "pl-2xl",
};

export interface InsetProps extends React.HTMLAttributes<HTMLElement> {
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
      className={cn(
        pad && P_CLASS[pad],
        x && PX_CLASS[x],
        y && PY_CLASS[y],
        t && PT_CLASS[t],
        r && PR_CLASS[r],
        b && PB_CLASS[b],
        l && PL_CLASS[l],
        className,
      )}
      {...rest}
    >
      {children}
    </As>
  );
}
