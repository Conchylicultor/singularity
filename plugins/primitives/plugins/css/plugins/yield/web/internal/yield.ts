/** Which axis the cell yields along (which `min-*-0` it emits). */
export type YieldAxis = "x" | "y";

/**
 * The pure yield class — single source of truth, exported so `fillClasses` and
 * the pure test share one definition.
 *
 * A yielding cell answers ONE of the two space-sharing questions: it may fall
 * BELOW its own content width, so a `<Text>`/`FilePath` inside can ellipsize —
 * and it answers the other question with "no", so it never takes the row's
 * slack.
 *
 * CSS floors a flex item at its content size (`min-width: auto`), which is what
 * makes the override necessary at all; `flex-grow` stays `0` and `flex-shrink`
 * stays at its `1` default, which is what keeps the cell out of the competition
 * for slack.
 *
 * **Axis matters here, unlike `rigidClass()`/`growClass()`.** `min-width: 0` and
 * `min-height: 0` are two DIFFERENT properties and only one is right for a given
 * container, whereas `flex-shrink`/`flex-grow` are single properties that
 * already apply along whichever axis the container declared as main.
 */
export function yieldClass(axis: YieldAxis): string {
  return axis === "y" ? "min-h-0" : "min-w-0";
}
