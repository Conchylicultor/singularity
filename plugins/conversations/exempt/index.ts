import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "timer/no-unlisted-timer",
    paths: ["server/internal/status-shadow-audit.ts"],
    kind: "debt",
    task: "task-1791333369805-0pjje0",
    reason:
      "TEMPORARY shadow audit, pending deletion: the retired 1 s status poller, now writing nothing and only reporting a state change no push signal delivered. Delete it (and this entry) once its reports stay empty (research/2026-10-07-conversations-status-shadow-audit-retirement.md).",
  },
  {
    rule: "live/no-legacy-resource-spelling",
    paths: ["web/use-conversations.ts"],
    kind: "debt",
    task: "task-1791372067670-epcpji",
    reason:
      "Burndown: imported an old live-resource spelling when phase 3 started and still depends on the tree resource (item 3). New code declares, serves and reads through network/live; delete this entry when the file migrates.",
  },
] satisfies Exemptions;
