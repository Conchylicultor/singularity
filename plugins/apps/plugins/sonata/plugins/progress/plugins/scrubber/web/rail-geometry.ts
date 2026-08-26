import type { Extent } from "@plugins/primitives/plugins/css/plugins/coords/web";

/**
 * Geometry of the progression rail — the single source of truth for where the
 * rail sits vertically. The scrubber draws the rail; any marker drawing a
 * vertical element *on* the rail (measure ticks, key-change bars, loop guides)
 * places itself with `RAIL_BAND_Y` so every on-rail mark shares one vertical
 * band and stays pixel-aligned with the rail and with each other. Change the
 * thickness here and the rail, the ticks, and the key bars all follow — they
 * cannot drift apart.
 *
 * This exists because the alternative — each marker re-hardcoding `h-2.5` +
 * centering — let the strata diverge: a marker that picked the "top half"
 * instead of the rail band floated above the ticks. Funnelling on-rail verticals
 * through one declaration makes that class of bug unrepresentable.
 */

/**
 * Rail thickness, as a LENGTH rather than a Tailwind class — one number both
 * the rail's own box and every on-rail mark's extent read. (0.625rem is
 * Tailwind's `2.5` step, which this used to be spelled as.)
 */
export const RAIL_HEIGHT = "0.625rem";

/**
 * The vertical extent that makes a placed box exactly cover the rail's band:
 * centered on the region's mid-line, rail-height tall. Pair it with whatever
 * horizontal extent the mark wants, e.g.
 * `<Placed x={{ center: pct(f), size: 1 }} y={RAIL_BAND_Y} />`.
 */
export const RAIL_BAND_Y: Extent = { center: "50%", size: RAIL_HEIGHT };
