import {
  rampClass,
  type SpaceStep,
} from "@plugins/primitives/plugins/css/plugins/space-ramp/core";
import {
  cn,
  SingleLineProvider,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type React from "react";

export type StackDirection = "col" | "row";
export type StackAlign = "start" | "center" | "end" | "stretch" | "baseline";
export type StackJustify =
  "start" | "center" | "end" | "between" | "around" | "evenly";

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
 *
 * ## Flow vs line: when a Stack RESETS the single-line contract
 *
 * A line container (`Frame`/`Row`/`Bar`/collapsible header) declares
 * single-line — its `SingleLine` context truncates leaves and its
 * `whitespace-nowrap` stops descendant text from wrapping. A Stack used as a
 * genuine FLOW region (a vertical block of paragraphs, or an explicitly wrapping
 * row) must RESET both so its text wraps again: it provides
 * `SingleLineProvider value={false}` (leaves stop truncating) and
 * `whitespace-normal` (raw text re-wraps), covering the two-line list-row label
 * nested inside a Frame.
 *
 * But a plain HORIZONTAL non-wrapping Stack (`direction="row"`, no `wrap`) is a
 * line-ish arrangement — a title group / inline cluster — and must INHERIT the
 * ambient contract, never reset it (else a row-Stack title inside a `region-line`
 * header would start wrapping). So the reset fires only for `col` or `wrap`
 * stacks; a row stack stays transparent to the surrounding line context.
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
  const isFlow = direction === "col" || !!wrap;
  const body = (
    <As
      ref={ref}
      className={cn(
        "flex",
        direction === "col" ? "flex-col" : "flex-row",
        rampClass("gap", gap),
        align && ALIGN_CLASS[align],
        justify && JUSTIFY_CLASS[justify],
        wrap && "flex-wrap",
        isFlow && "whitespace-normal",
        className,
      )}
      {...rest}
    >
      {children}
    </As>
  );
  return isFlow ? (
    <SingleLineProvider value={false}>{body}</SingleLineProvider>
  ) : (
    body
  );
}
