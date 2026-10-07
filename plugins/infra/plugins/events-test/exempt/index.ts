import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "jobs:no-raw-addjob",
    paths: ["server/internal/cron-dedup.ts"],
    kind: "sanctioned",
    reason:
      "The cron-dedup regression harness: inserts a row under a literal job key an hour ahead, asserts graphile's upsert behaviour under the cron path's `job_key` / `job_key_mode`, and removes it. Driving `add_job` directly avoids a permanently-installed `* * * * *` schedule and a multi-minute wait.",
  },
  {
    rule: "endpoints:no-raw-json-handlers",
    paths: ["server/internal"],
    kind: "sanctioned",
    reason:
      "Long-poll / onDeadline test handlers with custom statuses and timeouts.",
  },
] satisfies Exemptions;
