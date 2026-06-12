/**
 * Geometry of the progression rail — the single source of truth for where the
 * rail sits vertically. The scrubber draws the rail; any marker drawing a
 * vertical element *on* the rail (measure ticks, key-change bars) composes
 * `railBandClass` so every on-rail mark shares one vertical band and stays
 * pixel-aligned with the rail and with each other. Change the thickness here and
 * the rail, the ticks, and the key bars all follow — they cannot drift apart.
 *
 * This exists because the alternative — each marker re-hardcoding `h-2.5` +
 * centering — let the strata diverge: a marker that picked the "top half"
 * instead of the rail band floated above the ticks. Funnelling on-rail verticals
 * through one class makes that class of bug unrepresentable.
 */

/** Rail thickness. Used by the rail fill and every on-rail vertical mark. */
export const RAIL_THICKNESS = "h-2.5";

/**
 * Absolute positioning class that makes a child exactly cover the rail's
 * vertical band — centered on the region's mid-line, rail-height tall. Compose
 * with horizontal placement + width/color, e.g. `${railBandClass} left-0 w-px`.
 */
export const railBandClass = `absolute top-1/2 -translate-y-1/2 ${RAIL_THICKNESS}`;
