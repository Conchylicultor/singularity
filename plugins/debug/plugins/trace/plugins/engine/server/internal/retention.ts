import { defineRetention } from "@plugins/infra/plugins/retention/server";
import { _traces } from "./tables";

// A trace is 7-day debugging evidence, not a durable artifact — it is written
// exactly when the system is slow, so the table would grow unbounded without a
// TTL. This `defineRetention` call IS `_traces`'s growth bound; the bound is
// recorded only when `traceRetention` is mounted in `register: [...]` (see
// `../index.ts`), so a defined-but-unmounted policy records nothing.
//
// `perWorktree: true`: each worktree owns its own traces in its own DB fork, so
// the sweep must run in every worktree backend (each over its own rows).
export const traceRetention = defineRetention({
  table: _traces,
  ttlDays: 7,
  cron: "0 3 * * *",
  perWorktree: true,
});
