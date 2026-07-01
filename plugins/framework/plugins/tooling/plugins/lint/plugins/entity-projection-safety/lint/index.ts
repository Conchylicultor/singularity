import noHandRolledEntityProjection from "./no-hand-rolled-entity-projection";

export default {
  name: "entity-projection-safety",
  rules: {
    "no-hand-rolled-entity-projection": noHandRolledEntityProjection,
  },
  ignores: {
    "no-hand-rolled-entity-projection": [
      // ── Deferred: entity-extension side-tables ──────────────────────────
      // The table is owned by `defineExtension` (a 1:1 side-table), which does
      // not yet derive a wire schema, so the loader must still rename the
      // `parentId` FK to the domain key. Migrates once `defineExtension` grows
      // a `.schema` (roadmap follow-up #1).
      "plugins/tasks/plugins/auto-start/server/internal/resource.ts",
      "plugins/conversations/plugins/conversations-view/plugins/queue/server/internal/resource.ts",
      "plugins/apps/plugins/sonata/plugins/transpose/server/internal/resource.ts",
      "plugins/apps/plugins/sonata/plugins/rich/plugins/key-mode/server/internal/resource.ts",
      "plugins/apps/plugins/sonata/plugins/sources/plugins/midi/server/internal/resource.ts",
    ],
  },
};
