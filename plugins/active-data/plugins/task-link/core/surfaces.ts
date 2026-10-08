import type { IdChipSurface } from "@plugins/active-data/plugins/id-chip/core";

/** Where a task chip belongs — read by BOTH halves, so they cannot disagree. */
export const TASK_CHIP_SURFACES: readonly IdChipSurface[] = [
  "transcript",
  "document",
];
