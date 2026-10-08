import type { IdChipSurface } from "@plugins/active-data/plugins/id-chip/core";

/** Where a build run chip belongs — read by BOTH halves, so they cannot disagree. */
export const BUILD_RUN_CHIP_SURFACES: readonly IdChipSurface[] = ["transcript"];
