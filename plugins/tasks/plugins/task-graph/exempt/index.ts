import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "endpoints/no-void-fetch-endpoint",
    paths: ["web/components/task-graph.tsx"],
    kind: "sanctioned",
    reason:
      "Whole-file genuine fire-and-forget: every fetchEndpoint here is a write whose failure is silent + self-correcting (drag/click again) AND whose state refreshes via a live-state push, not the response. This is the sanctioned `void fetchEndpoint()` use named in the endpoints CLAUDE.md. Files with a MIX of fire-and-forget and user-triggered calls are NOT listed here — they carry per-line inline disables instead.  DnD edge connect; tasksResource push re-renders the graph.",
  },
] satisfies Exemptions;
