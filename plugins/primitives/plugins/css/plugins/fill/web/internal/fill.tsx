import { growClass } from "@plugins/primitives/plugins/css/plugins/grow/web";
import { yieldClass } from "@plugins/primitives/plugins/css/plugins/yield/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type React from "react";

/**
 * Which axis the cell flexes along (which `min-*-0` pairs with `flex-1`).
 *
 * Structurally identical to `yield`'s `YieldAxis`, and declared here rather than
 * imported because `fill` imports `yield` (not the other way round) — pulling
 * the type back would cycle. The drift that would matter is already a compile
 * error: widening `FillAxis` breaks the `yieldClass()` call below.
 */
export type FillAxis = "x" | "y";

/**
 * The pure fill class map — single source of truth, exported so the component
 * and the pure test share one definition.
 *
 * A flexible cell is exactly the composition of the two space-sharing halves,
 * and is DERIVED from them so the pair cannot drift from its parts:
 * - `growClass()` (`flex-1`) — take the row's slack.
 * - `yieldClass(axis)` (the axis-matched `min-*-0`) — give below its own
 *   content. CSS floors a flex item at its content size (`min-width:auto`), so
 *   without this half the cell refuses to shrink and overflows (and, worse, can
 *   collapse a rigid `shrink-0` sibling).
 *
 * Yield first, grow second — the emitted string stays byte-identical to the
 * hand-written `"min-w-0 flex-1"` this replaced, so nothing rendered moves.
 *
 * Reach for ONE half when only one is wanted: two siblings that must yield
 * *together* both take `yieldClass` (this basis-0 grow would squeeze one of them
 * alone), and a cell whose content must not be crushed takes `growClass`.
 */
export function fillClasses(axis: FillAxis): string {
  return `${yieldClass(axis)} ${growClass()}`;
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
  // Deliberately NOT a `GrowRelay`, though it sits mid-chain in the Sonata
  // display picker (slot cell → Fill → Stack → the bar): a Fill already grows
  // unconditionally, and a grow ask crosses it for free, because context passes
  // through any component. A relay here would buy nothing and cost a fiber plus
  // a provider at every one of Fill's call sites, many of them list rows.
  return (
    <As ref={ref} className={cn(fillClasses(axis), className)} {...rest}>
      {children}
    </As>
  );
}
