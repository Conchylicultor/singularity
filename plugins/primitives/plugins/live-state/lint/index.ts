import noPendingDataCollapse from "./no-pending-data-collapse";

export default {
  name: "live-state",
  rules: {
    "no-pending-data-collapse": noPendingDataCollapse,
  },
  ignores: {
    // BURNDOWN COMPLETE — the rule landed (2026-06-11) with ~67 grandfathered
    // collapse sites; all have since been migrated to <ResourceView>/
    // matchResource/combineResources (or DataView `loading`). The allowlist is
    // intentionally EMPTY: the rule must stay green by migrating, never by
    // exempting. Do NOT add entries.
    "no-pending-data-collapse": [],
  },
};
