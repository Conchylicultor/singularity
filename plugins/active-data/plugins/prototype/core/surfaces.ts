import type { IdChipSurface } from "@plugins/active-data/plugins/id-chip/core";

/** Where a prototype chip belongs — read by BOTH halves, so they cannot disagree. */
export const PROTOTYPE_CHIP_SURFACES: readonly IdChipSurface[] = [
  "transcript",
  "document",
];
