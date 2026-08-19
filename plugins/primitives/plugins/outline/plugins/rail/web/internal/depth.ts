import type { SpaceStep } from "@plugins/primitives/plugins/css/plugins/space-ramp/core";

/**
 * The depth ramp is a closed 3 steps, and anything deeper clamps to the last
 * one. An outline is a glance-able indicator, not a tree: past three levels the
 * dashes stop being distinguishable and the panel indent starts eating the label.
 */
export function depthStep(depth: number): 0 | 1 | 2 {
  if (depth <= 0) return 0;
  if (depth === 1) return 1;
  return 2;
}

/** Dash width at rest, per depth step. */
export const DASH_WIDTH = ["w-4", "w-3", "w-2"] as const;

/**
 * Dash width when active — one step WIDER than at rest. The active dash reads
 * through both length and brightness, so it survives a color-blind reader and a
 * washed-out screen alike.
 */
export const DASH_WIDTH_ACTIVE = ["w-5", "w-4", "w-3"] as const;

/**
 * Left padding of a panel row, per depth step. `undefined` at depth 0 leaves the
 * row's own `p-row` padding alone.
 */
export const ROW_INDENT: readonly (SpaceStep | undefined)[] = [
  undefined,
  "lg",
  "2xl",
];

/**
 * Height of one dash row in px — a fixed-height box with the bar centered in it,
 * NOT a bar plus a ramp gap. The rail has to convert an available height into a
 * dash count, and a density-token gap would make that conversion a guess that
 * drifts with the active preset. This is the one place a raw pixel step is the
 * honest answer, and `h-2` below is its single mirror.
 */
export const DASH_STEP_PX = 8;
