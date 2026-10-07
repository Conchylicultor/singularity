import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "endpoints/no-void-fetch-endpoint",
    paths: ["web/components/task-graph.tsx"],
    kind: "sanctioned",
    reason:
      "Whole-file genuine fire-and-forget: every fetchEndpoint here is a write whose failure is silent + self-correcting (drag/click again) AND whose state refreshes via a live-state push, not the response. This is the sanctioned `void fetchEndpoint()` use named in the endpoints CLAUDE.md. Files with a MIX of fire-and-forget and user-triggered calls are NOT listed here — they carry per-line inline disables instead.  DnD edge connect; tasksResource push re-renders the graph.",
  },
  {
    rule: "live/no-legacy-resource-spelling",
    paths: ["web/hooks.ts"],
    kind: "debt",
    task: "task-1791372067670-epcpji",
    reason:
      "Burndown: imported an old live-resource spelling when phase 3 started and still depends on the tree resource (item 3). New code declares, serves and reads through network/live; delete this entry when the file migrates.",
  },
] satisfies Exemptions;
