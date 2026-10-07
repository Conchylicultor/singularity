import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "endpoints/no-void-fetch-endpoint",
    paths: ["web/components/pages-sidebar.tsx"],
    kind: "sanctioned",
    reason:
      "Page-tree expand toggle + DnD reorder; the page_blocks push refreshes.",
  },
  {
    rule: "live/no-legacy-resource-spelling",
    paths: [
      "web/components/delete-page-action.tsx",
      "web/components/page-breadcrumb.tsx",
      "web/components/page-cover.tsx",
      "web/components/page-header.tsx",
      "web/components/pages-sidebar.tsx",
      "web/internal/block-target.ts",
      "web/panes.tsx",
    ],
    kind: "debt",
    task: "task-1791372067670-epcpji",
    reason:
      "Burndown: imported an old live-resource spelling when phase 3 started and still depends on the tree resource (item 3). New code declares, serves and reads through network/live; delete this entry when the file migrates.",
  },
] satisfies Exemptions;
