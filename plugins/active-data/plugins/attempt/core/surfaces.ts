import type { IdChipSurface } from "@plugins/active-data/plugins/id-chip/core";

/** Where an attempt chip belongs — read by BOTH halves, so they cannot disagree. */
export const ATTEMPT_CHIP_SURFACES: readonly IdChipSurface[] = [
  "transcript",
  "document",
];
