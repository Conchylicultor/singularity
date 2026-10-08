import type { IdChipSurface } from "@plugins/active-data/plugins/id-chip/core";

/** Where a report chip belongs — read by BOTH halves, so they cannot disagree. */
export const REPORT_CHIP_SURFACES: readonly IdChipSurface[] = ["transcript"];
