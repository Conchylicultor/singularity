import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type React from "react";

/**
 * The closed 8-step spacing ramp. Each step maps to a `gap-<step>` / `p-<step>`
 * `@utility` backed by the density token group's `--space-*` runtime vars, so
 * every gap/inset scales together with the active density preset. Pick a step,
 * never a raw `gap-2`/`p-3` — the `no-adhoc-spacing` lint rule enforces this
 * repo-wide.
 */
export type SpaceStep = "none" | "2xs" | "xs" | "sm" | "md" | "lg" | "xl" | "2xl";

const GAP_CLASS: Record<SpaceStep, string> = {
  none: "gap-none",
  "2xs": "gap-2xs",
  xs: "gap-xs",
  sm: "gap-sm",
  md: "gap-md",
  lg: "gap-lg",
  xl: "gap-xl",
  "2xl": "gap-2xl",
};

export type StackDirection = "col" | "row";
export type StackAlign = "start" | "center" | "end" | "stretch" | "baseline";
export type StackJustify =
  | "start"
  | "center"
  | "end"
  | "between"
  | "around"
  | "evenly";

const ALIGN_CLASS: Record<StackAlign, string> = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  stretch: "items-stretch",
  baseline: "items-baseline",
};

const JUSTIFY_CLASS: Record<StackJustify, string> = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
  between: "justify-between",
  around: "justify-around",
  evenly: "justify-evenly",
};

export interface StackProps extends React.HTMLAttributes<HTMLElement> {
  /** Flex axis. Defaults to `col` (vertical stack — the common case). */
  direction?: StackDirection;
  /** Gap role from the spacing ramp — the only way to space children. Required. */
  gap: SpaceStep;
  /** Cross-axis alignment (`items-*`). */
  align?: StackAlign;
  /** Main-axis distribution (`justify-*`). */
  justify?: StackJustify;
  /** Allow children to wrap. */
  wrap?: boolean;
  /** Host element/component. Defaults to a `div`. */
  as?: React.ElementType;
  /** Forwarded to the rendered element (mirrors Surface/Card/Row). */
  ref?: React.Ref<HTMLElement>;
}

/**
 * Flex layout container with a gap drawn from the closed spacing ramp. Replaces
 * hand-written `flex flex-col gap-*` / `space-y-*`. Caller `className` composes
 * last, so layout overrides (width, min-w-0, …) win.
 */
export function Stack({
  direction = "col",
  gap,
  align,
  justify,
  wrap,
  as: As = "div",
  ref,
  className,
  children,
  ...rest
}: StackProps) {
  return (
    <As
      ref={ref}
      className={cn(
        "flex",
        direction === "col" ? "flex-col" : "flex-row",
        GAP_CLASS[gap],
        align && ALIGN_CLASS[align],
        justify && JUSTIFY_CLASS[justify],
        wrap && "flex-wrap",
        className,
      )}
      {...rest}
    >
      {children}
    </As>
  );
}
