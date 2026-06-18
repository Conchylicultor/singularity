import type {
  SpaceStep,
  StackAlign,
  StackJustify,
} from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type React from "react";

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

export interface GridProps
  extends React.HTMLAttributes<HTMLElement> {
  /** Minimum width each cell wants before the row wraps to fewer columns —
   *  drives the responsive `repeat(auto-fill|fit, minmax(<minCellWidth>, 1fr))`.
   *  e.g. `"12rem"`. Required. */
  minCellWidth: string;
  /** `fill` keeps empty trailing tracks (stable column count); `fit` collapses
   *  them so present cells stretch to fill the row. Defaults to `fill`. */
  mode?: "fill" | "fit";
  /** Fixed column count instead of the responsive path. When set it WINS over
   *  `minCellWidth`/`mode` (each track is `minmax(0, 1fr)`). */
  cols?: number;
  /** Gap between cells, from the spacing ramp. Defaults to `md`. */
  gap?: SpaceStep;
  /** Cross-axis alignment within each cell (`align-items`). */
  align?: StackAlign;
  /** Main-axis distribution of the tracks (`justify-content`). */
  justify?: StackJustify;
  /** Host element/component. Defaults to a `div`. */
  as?: React.ElementType;
  /** Forwarded to the rendered element (mirrors Surface/Card/Row). */
  ref?: React.Ref<HTMLElement>;
}

/**
 * Build the `grid-template-columns` track list — the single source of truth for
 * Grid's column geometry, exported so the component and the pure test share one
 * definition.
 *
 * Two mutually-exclusive paths:
 * - **Fixed** (`cols != null`) → `repeat(<cols>, minmax(0, 1fr))`: exactly N
 *   equal columns, each able to shrink to 0 (the `minmax(0,…)` min) so inner
 *   content never forces an overflow. `cols` wins over `minCellWidth`.
 * - **Responsive** (`cols` absent) → `repeat(auto-fill|auto-fit, minmax(<minCellWidth>, 1fr))`:
 *   the browser packs as many `minCellWidth`-wide tracks as fit, then each track
 *   grows to `1fr` to share the leftover. `auto-fill` (mode `fill`) keeps empty
 *   trailing tracks so the column count is stable; `auto-fit` (mode `fit`)
 *   collapses them so the present cells stretch to fill the whole row.
 */
export function gridTemplateColumns(opts: {
  minCellWidth: string;
  mode: "fill" | "fit";
  cols?: number;
}): string {
  if (opts.cols != null) return `repeat(${opts.cols}, minmax(0, 1fr))`;
  return `repeat(${opts.mode === "fit" ? "auto-fit" : "auto-fill"}, minmax(${opts.minCellWidth}, 1fr))`;
}

/**
 * Responsive / uniform grid primitive — the wrapping, equal-width card grid
 * (galleries, launcher grids). The structural `rigid | flexible | rigid` row is
 * Frame's job; Grid owns the remaining concern with no other home: a grid of
 * uniform cells that reflows by available width.
 *
 * It is a CLOSED prop surface, NOT a raw `grid-template` passthrough — you say
 * how wide a cell wants to be (`minCellWidth`) or how many columns (`cols`) and
 * the track function does the rest. An arbitrary template string is exactly the
 * raw CSS the layout standard bans; that genuine long tail stays a per-site lint
 * escape, never a prop here. The full track logic lives in `gridTemplateColumns`.
 *
 * Caller `className` composes last.
 */
export function Grid({
  minCellWidth,
  mode = "fill",
  cols,
  gap = "md",
  align,
  justify,
  as: As = "div",
  ref,
  className,
  children,
  ...rest
}: GridProps) {
  return (
    <As
      ref={ref}
      className={cn(
        "grid",
        GAP_CLASS[gap],
        align && ALIGN_CLASS[align],
        justify && JUSTIFY_CLASS[justify],
        className,
      )}
      style={{ gridTemplateColumns: gridTemplateColumns({ minCellWidth, mode, cols }) }}
      {...rest}
    >
      {children}
    </As>
  );
}
