import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type React from "react";

/** Which axis the cell flexes along (which `min-*-0` pairs with `flex-1`). */
export type FillAxis = "x" | "y";

/**
 * The pure fill class map — single source of truth, exported so the component
 * and the pure test share one definition.
 *
 * A flexible cell needs BOTH halves, always together:
 * - `flex-1` — grow into slack AND shrink under pressure.
 * - the axis-matched `min-*-0` — CSS floors a flex item at its content size
 *   (`min-width:auto`), so without it the cell refuses to shrink and overflows
 *   (and, worse, can collapse a rigid `shrink-0` sibling). This is the exact
 *   pair `Scroll`/`Clip` already emit for a filling pane.
 */
export function fillClasses(axis: FillAxis): string {
  return axis === "y" ? "min-h-0 flex-1" : "min-w-0 flex-1";
}

export interface FillProps extends React.HTMLAttributes<HTMLElement> {
  /** Which axis to flex along. Defaults to `x` (the Line/Row case). */
  axis?: FillAxis;
  /** Host element/component. Defaults to a `div`. */
  as?: React.ElementType;
  /** Forwarded to the rendered element (mirrors Clip/Surface/Row). */
  ref?: React.Ref<HTMLElement>;
}

/**
 * The single flexible cell of a flex container — the elastic sibling of the
 * rigid `Badge`/icon. It OWNS the `min-w-0 flex-1` pair (the one sanctioned
 * home) so the recurring "this cell absorbs the slack and lets its `<Text>`
 * leaf truncate" recipe is named once, instead of hand-rolled at every call
 * site where a stray `flex-1` on the WRONG element strands the grow slot (the
 * CollapsibleCard header bug: a `flex-1` identity group grew empty while the
 * real content sat in a non-growing sibling).
 *
 * Pair it with a line container: `<Line>` (or `<Row>`/`<Bar>`) gives the
 * single-line context, the rigid chips stay `shrink-0`, and the ONE `<Fill>`
 * cell holds the `<Text>`/`FilePath` that ellipsizes. An empty `<Fill>` is the
 * idiomatic way to push trailing actions flush-right (it absorbs the slack
 * between identity and actions) — the structural replacement for `ml-auto`.
 *
 * Fill adds NO truncation/overflow of its own — that is the `<Text>` leaf's job
 * (and box clipping is `<Clip>`'s); Fill is purely the flex-cell mechanic.
 *
 * Caller `className` composes last.
 */
export function Fill({
  axis = "x",
  as: As = "div",
  ref,
  className,
  children,
  ...rest
}: FillProps) {
  return (
    <As ref={ref} className={cn(fillClasses(axis), className)} {...rest}>
      {children}
    </As>
  );
}
