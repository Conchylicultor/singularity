import noPendingDataCollapse from "./no-pending-data-collapse";

export default {
  name: "live-state",
  rules: {
    "no-pending-data-collapse": noPendingDataCollapse,
  },
  ignores: {
    // The ternary-form BURNDOWN (the rule's original 2026-06-11 wave, ~67 sites)
    // is COMPLETE — all migrated to <ResourceView>/matchResource/combineResources
    // (or DataView `loading`).
    //
    // STATEMENT-FORM WAVE (2026-06-12): the rule was extended to also catch the
    // early-return form `if (x.pending) return <typed-empty>` (same collapse, a
    // second syntactic shape — see no-pending-data-collapse.ts). The reference
    // case (useEditedFiles) was fixed; the genuine value-producing holdouts below
    // are grandfathered pending a follow-up migration to a gateable ResourceResult
    // / <ResourceView> / combineResources. MIGRATE these — never add new entries.
    "no-pending-data-collapse": [
      "plugins/config_v2/plugins/settings/web/internal/use-conflicts.ts",
      "plugins/config_v2/plugins/settings/web/internal/use-tiers.ts",
      "plugins/config_v2/web/internal/use-scope-forked.ts",
      "plugins/tasks/plugins/task-events/web/components/task-events.tsx",
      "plugins/tasks/plugins/task-list/plugins/recent/web/internal/tasks-recent-view.tsx",
      "plugins/apps/plugins/story/plugins/marker/web/hooks.ts",
    ],
  },
};
