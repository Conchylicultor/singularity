import type { IdChipSurface } from "@plugins/active-data/plugins/id-chip/core";

/** Where a conversation chip belongs — read by BOTH halves, so they cannot disagree. */
export const CONV_CHIP_SURFACES: readonly IdChipSurface[] = [
  "transcript",
  "document",
];
