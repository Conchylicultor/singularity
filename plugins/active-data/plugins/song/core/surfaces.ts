import type { IdChipSurface } from "@plugins/active-data/plugins/id-chip/core";

/** Where a song chip belongs — read by BOTH halves, so they cannot disagree. */
export const SONG_CHIP_SURFACES: readonly IdChipSurface[] = [
  "transcript",
  "document",
];
