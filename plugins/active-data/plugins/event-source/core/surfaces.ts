import type { IdChipSurface } from "@plugins/active-data/plugins/id-chip/core";

/** Where an event source chip belongs — read by BOTH halves, so they cannot disagree. */
export const EVENT_SOURCE_CHIP_SURFACES: readonly IdChipSurface[] = [
  "transcript",
];
