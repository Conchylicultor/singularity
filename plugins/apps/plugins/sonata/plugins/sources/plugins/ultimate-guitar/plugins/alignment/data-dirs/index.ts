import { defineDataDir } from "@plugins/infra/plugins/paths/core";

/**
 * The calibration set's UG tabs, host-wide: `<tabId>.json`, each the body the
 * UG fetch endpoint returned, written by `scripts/calibrate.ts --set --fetch`.
 * Tab content stays out of the repo; the set itself (ids only) is in the
 * script.
 *
 * `cache`: any entry is re-fetched from UG on demand.
 */
export const ugCalibrationTabsDir = defineDataDir({
  kind: "cache",
  name: "ug-calibration",
  owner: "apps/sonata/sources/ultimate-guitar/alignment",
  description:
    "UG tabs of the alignment calibration set, fetched once by the calibration script",
  reclaim: { kind: "safe" },
});

export default [ugCalibrationTabsDir];
