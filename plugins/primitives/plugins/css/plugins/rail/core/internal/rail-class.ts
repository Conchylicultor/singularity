/**
 * The class-string twin of `insetClass()` (`primitives/css/spacing`), for the
 * rail ramp. Same shape, same general→specific resolution, same reason to exist.
 *
 * THE LITERAL TABLES ARE THE POINT. Tailwind emits an `@utility` only when its
 * source scanner finds the literal token, so `` `rail-x-${step}` `` at a call
 * site compiles to nothing and "works" only when some other file happens to
 * spell the same class. The step→class records live here as literals; call sites
 * pass the step and never build the class.
 *
 * Two deliberate differences from `insetClass`, both forced by living in `core/`
 * rather than `web/`:
 *   - it joins rather than calling `cn()`, which is a ui-kit (web) export a core
 *     module may not import. Nothing is lost: one key resolves to one class and
 *     no two keys land in the same tailwind-merge group, so there is no conflict
 *     for `cn` to settle. Callers compose the result inside their own `cn(…)`
 *     anyway, which is where their `className` override has to win.
 *   - `RailStep` is declared here rather than reusing spacing's `SpaceStep`,
 *     which is a web export. The two must stay the same 8 steps; they are the
 *     same density ramp read twice.
 */

/** The spacing ramp's steps. Mirrors `SpaceStep` in `primitives/css/spacing`. */
export type RailStep =
  "none" | "2xs" | "xs" | "sm" | "md" | "lg" | "xl" | "2xl";

const RAIL_CLASS: Record<RailStep, string> = {
  none: "rail-none",
  "2xs": "rail-2xs",
  xs: "rail-xs",
  sm: "rail-sm",
  md: "rail-md",
  lg: "rail-lg",
  xl: "rail-xl",
  "2xl": "rail-2xl",
};
const RAIL_X_CLASS: Record<RailStep, string> = {
  none: "rail-x-none",
  "2xs": "rail-x-2xs",
  xs: "rail-x-xs",
  sm: "rail-x-sm",
  md: "rail-x-md",
  lg: "rail-x-lg",
  xl: "rail-x-xl",
  "2xl": "rail-x-2xl",
};
const RAIL_Y_CLASS: Record<RailStep, string> = {
  none: "rail-y-none",
  "2xs": "rail-y-2xs",
  xs: "rail-y-xs",
  sm: "rail-y-sm",
  md: "rail-y-md",
  lg: "rail-y-lg",
  xl: "rail-y-xl",
  "2xl": "rail-y-2xl",
};
const RAIL_OWE_CLASS: Record<RailStep, string> = {
  none: "rail-owe-none",
  "2xs": "rail-owe-2xs",
  xs: "rail-owe-xs",
  sm: "rail-owe-sm",
  md: "rail-owe-md",
  lg: "rail-owe-lg",
  xl: "rail-owe-xl",
  "2xl": "rail-owe-2xl",
};

/**
 * Which rail a box opens. `rail` covers both axes; `x`/`y` narrow it to one.
 *
 * `owe` is the other MODE, not another side: it opens the region and applies no
 * padding, leaving each `rail-follow` descendant to apply the rail itself. Since
 * a box cannot both pay its rail and hand the bill on, the union makes "pay and
 * defer" unspellable rather than something that resolves by stylesheet order.
 */
export type RailSides =
  | { rail?: RailStep; x?: RailStep; y?: RailStep; owe?: undefined }
  | { rail?: undefined; x?: undefined; y?: undefined; owe: RailStep };

/**
 * Resolve ramp steps to their rail utility classes, general→specific. For
 * consumers that can only take a `className` string, and for the one place a
 * step is a variable.
 */
export function railClass({ rail, x, y, owe }: RailSides): string {
  return [
    rail && RAIL_CLASS[rail],
    x && RAIL_X_CLASS[x],
    y && RAIL_Y_CLASS[y],
    owe && RAIL_OWE_CLASS[owe],
  ]
    .filter(Boolean)
    .join(" ");
}
