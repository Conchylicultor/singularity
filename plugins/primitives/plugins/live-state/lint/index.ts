import noPendingDataCollapse from "./no-pending-data-collapse";

export default {
  name: "live-state",
  rules: {
    "no-pending-data-collapse": noPendingDataCollapse,
  },
  ignores: {
    // BURNDOWN COMPLETE — both waves are fully migrated and the allowlist is
    // EMPTY. Keep it that way: never add a new entry. Fix the collapse instead —
    // expose a gateable ResourceResult and gate at the caller with
    // <ResourceView>/matchResource/combineResources (or DataView `loading`).
    //
    //   - Ternary form `x.pending ? <empty> : x.data` (original 2026-06-11 wave,
    //     ~67 sites) — done.
    //   - Statement form `if (x.pending) return <typed-empty>` (2026-06-12 wave,
    //     6 value-producing holdouts) — done.
    "no-pending-data-collapse": [],
  },
};
