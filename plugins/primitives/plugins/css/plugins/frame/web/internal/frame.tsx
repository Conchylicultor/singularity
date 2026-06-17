import { TruncatingText } from "@plugins/primitives/plugins/css/plugins/truncating-text/web";
import type { SpaceStep } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { cn } from "@plugins/primitives/plugins/ui-kit/web";
import type React from "react";
import type { ReactNode } from "react";

/**
 * Cross-axis alignment for the row — a subset of `StackAlign` that makes sense
 * for a single-line named-slot row. `items-*` utilities apply to a grid the same
 * as to flex.
 */
export type FrameAlign = "center" | "start" | "baseline";

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

const ALIGN_CLASS: Record<FrameAlign, string> = {
  start: "items-start",
  center: "items-center",
  baseline: "items-baseline",
};

export interface FrameProps
  // `content` is a (deprecated) global HTML attribute typed `string` on
  // `HTMLAttributes`; omit it so our `ReactNode` slot prop is the one that wins.
  extends Omit<React.HTMLAttributes<HTMLElement>, "content"> {
  /** Rigid leading cluster — `auto` track, never shrinks (icons/chips stay whole). */
  leading?: ReactNode;
  /** Primary content — flexible track, truncates LAST. A string is wrapped in
   *  `<TruncatingText>`; a node gets a bare `min-w-0` track. */
  content?: ReactNode;
  /** Secondary metadata — flexible track, truncates FIRST. Same string/node rule. */
  meta?: ReactNode;
  /** Rigid trailing cluster — `auto` track, right-justified, never shrinks. */
  trailing?: ReactNode;
  /** Gap role from the spacing ramp. Defaults to `sm`. */
  gap?: SpaceStep;
  /** Cross-axis alignment. Defaults to `center`. */
  align?: FrameAlign;
  /** Host element/component. Defaults to a `div`. */
  as?: React.ElementType;
}

/**
 * Build the `grid-template-columns` track list from which slots are present.
 *
 * The single source of truth for the row's shrink hierarchy — exported so the
 * component and the geometry test share one definition (the test is the oracle
 * that certified these exact track strings by measuring TRUNCATION ONSET, not
 * track allocation).
 *
 * Tracks, in order, filtering absent slots:
 * - `leading`  → `auto`                   (rigid, never shrinks)
 * - `content`  → `minmax(0,max-content)`  (primary; holds its width, truncates LAST)
 * - `meta`     → `minmax(0,1fr)`          (secondary; yields all space, truncates FIRST)
 * - `trailing` → `auto`                   (rigid, never shrinks)
 *
 * ## Why the row always carries a flexible track (the `fill`)
 *
 * The grid needs EXACTLY ONE flexible (`1fr`) track to absorb the container's
 * leftover width. Without one, the leftover pools into the rigid `auto` clusters:
 * `justify-content`'s default (`stretch`) grows auto-MAX tracks equally, so a row
 * of `leading | content | trailing` (no `meta`) splits the slack between `leading`
 * and `trailing`, shoving `content` into the CENTER and unpinning `trailing` from
 * the right edge. `meta`'s `minmax(0,1fr)` is normally that flexible track; when
 * `meta` is absent but a `trailing` cluster still needs pinning right, an inert
 * spacer takes meta's slot (`fill = meta || trailing`). The component renders an
 * empty `<div>` into that spacer track. `justify-content: start` (set on the grid)
 * handles the remaining no-flex shapes (e.g. `leading | content`, no trailing):
 * with no `fr` track to grow, leftover packs at the end so `content` stays left.
 *
 * ## Why strict priority, not weighted `fr`
 *
 * The contract is STRICT, not proportional: `meta` must give up every pixel of
 * its space before `content` truncates a single character. A weighted-`fr` split
 * (`content:3fr meta:1fr`) only expresses *proportional* sharing — both tracks
 * shrink together, so a long `content` starts ellipsizing while `meta` still has
 * room. It also starves `meta`'s small `fr` track below its content width even in
 * a roomy row, so `meta` is truncated when it shouldn't be. The geometry test
 * (which measures `scrollWidth > clientWidth` per slot across a width sweep)
 * exposed both faults.
 *
 * The strict construct is `content: minmax(0,max-content)` + `meta: minmax(0,1fr)`:
 * - When roomy, `content` sits at its `max-content` natural width (no truncation)
 *   and `meta`'s `1fr` claims the entire leftover, so neither truncates.
 * - As the row narrows, grid shrinks the flexible `1fr` track first — `meta`
 *   gives up space and starts ellipsizing while `content` stays whole at its
 *   max-content width.
 * - Only once `meta`'s `1fr` is crushed to 0 does grid shrink `content`'s
 *   `minmax`'s max below max-content — so `content` truncates LAST.
 * - The `minmax(0,…)` min on both lets each slot reach 0 / fully ellipsize, so
 *   nothing ever clips or overflows the container.
 *
 * Rejected candidates the truncation-onset test falsified:
 * - `content:minmax(0,1fr) meta:auto` (and `meta:max-content`) — `meta` is rigid,
 *   so `content` (the lone flexible track) truncates FIRST. Inverted.
 * - `content:minmax(0,3fr) meta:minmax(0,1fr)` — proportional; `meta` truncates
 *   even in a roomy row and `content` truncates before `meta` is exhausted.
 */
export function frameGridTemplate(present: {
  leading: boolean;
  content: boolean;
  meta: boolean;
  trailing: boolean;
}): string {
  // The single flexible track (`meta`, or an inert spacer pinning `trailing`).
  const fill = present.meta || present.trailing;
  return [
    present.leading && "auto",
    present.content && "minmax(0,max-content)",
    fill && "minmax(0,1fr)",
    present.trailing && "auto",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Wrap a flexible-track slot: a string truncates, a node keeps a bare min-w-0 track. */
function FlexSlot({ children }: { children: ReactNode }) {
  return typeof children === "string" ? (
    <TruncatingText>{children}</TruncatingText>
  ) : (
    <div className="min-w-0">{children}</div>
  );
}

/**
 * Named-slot row primitive. A horizontal row of up to four role slots —
 * `leading` / `content` / `meta` / `trailing` — laid out on a CSS grid with the
 * shrink hierarchy baked into one place: rigid clusters never crush, primary
 * content absorbs slack and truncates last, secondary metadata truncates first.
 *
 * Callers write roles, never mechanics (no per-call-site `min-w-0` / `shrink-0` /
 * `flex-1`). Only present slots render — an absent slot produces no track and no
 * phantom gap. Caller `className` composes last.
 */
export function Frame({
  leading,
  content,
  meta,
  trailing,
  gap = "sm",
  align = "center",
  as: As = "div",
  className,
  ...rest
}: FrameProps) {
  const present = {
    leading: leading != null,
    content: content != null,
    meta: meta != null,
    trailing: trailing != null,
  };
  // The flexible track: `meta` when present, else an inert spacer that absorbs
  // the row's slack so `trailing` pins right and `content` is never centered.
  const fill = present.meta || present.trailing;
  return (
    <As
      // `justify-start` packs tracks left in the no-flex shapes (no fill track),
      // so a lone rigid `auto` never stretches and shoves `content` off the edge.
      className={cn(
        "grid justify-start",
        GAP_CLASS[gap],
        ALIGN_CLASS[align],
        className,
      )}
      style={{ gridTemplateColumns: frameGridTemplate(present) }}
      {...rest}
    >
      {present.leading && (
        <div className={cn("flex items-center", GAP_CLASS[gap])}>{leading}</div>
      )}
      {present.content && <FlexSlot>{content}</FlexSlot>}
      {fill &&
        (present.meta ? (
          <FlexSlot>{meta}</FlexSlot>
        ) : (
          <div className="min-w-0" aria-hidden />
        ))}
      {present.trailing && (
        <div className={cn("flex items-center justify-end", GAP_CLASS[gap])}>
          {trailing}
        </div>
      )}
    </As>
  );
}
