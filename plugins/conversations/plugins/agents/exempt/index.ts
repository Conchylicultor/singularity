import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "live/no-legacy-resource-spelling",
    paths: [
      "server/internal/resources.ts",
      "shared/resources.ts",
      "web/components/agent-avatar-row.tsx",
      "web/components/agent-avatar-title-prefix.tsx",
      "web/components/agent-detail.tsx",
      "web/components/agent-launches.tsx",
      "web/components/agent-status.tsx",
    ],
    kind: "debt",
    task: "task-1791372067670-epcpji",
    reason:
      "Burndown: imported an old live-resource spelling when phase 3 started and still depends on the tree resource (item 3). New code declares, serves and reads through network/live; delete this entry when the file migrates.",
  },
] satisfies Exemptions;
