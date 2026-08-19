import {
  rampClass,
  type SpaceStep,
} from "@plugins/primitives/plugins/css/plugins/space-ramp/core";

/**
 * The class-string twin of `insetClass()` (`primitives/css/spacing`), for the
 * rail ramp. Same shape, same general→specific resolution, same reason to exist.
 *
 * One deliberate difference from `insetClass`, forced by living in `core/`
 * rather than `web/`: it joins rather than calling `cn()`, which is a ui-kit
 * (web) export a core module may not import. Nothing is lost — one key resolves
 * to one class and no two keys land in the same tailwind-merge group, so there
 * is no conflict for `cn` to settle. Callers compose the result inside their own
 * `cn(…)` anyway, which is where their `className` override has to win.
 */

/**
 * Which rail a box opens. `rail` covers both axes; `x`/`y` narrow it to one.
 *
 * `owe` is the other MODE, not another side: it opens the region and applies no
 * padding, leaving each `rail-follow` descendant to apply the rail itself. Since
 * a box cannot both pay its rail and hand the bill on, the union makes "pay and
 * defer" unspellable rather than something that resolves by stylesheet order.
 */
export type RailSides =
  | { rail?: SpaceStep; x?: SpaceStep; y?: SpaceStep; owe?: undefined }
  | { rail?: undefined; x?: undefined; y?: undefined; owe: SpaceStep };

/**
 * Resolve ramp steps to their rail utility classes, general→specific. For
 * consumers that can only take a `className` string, and for the one place a
 * step is a variable.
 */
export function railClass({ rail, x, y, owe }: RailSides): string {
  return [
    rail && rampClass("rail", rail),
    x && rampClass("rail-x", x),
    y && rampClass("rail-y", y),
    owe && rampClass("rail-owe", owe),
  ]
    .filter(Boolean)
    .join(" ");
}
