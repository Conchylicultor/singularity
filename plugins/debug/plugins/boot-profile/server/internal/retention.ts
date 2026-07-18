import { defineRetention } from "@plugins/infra/plugins/retention/server";
import { _bootTraces } from "./tables";

// Saved boot-trace snapshots are a debugging convenience (shareable permalinks),
// not durable records — kept 30 days, then swept so the table never grows
// unbounded. This `defineRetention` call IS `_bootTraces`'s growth bound; the
// bound is recorded only when `bootTraceRetention` is mounted in `register: [...]`
// (see `../index.ts`), so a defined-but-unmounted policy records nothing.
//
// `perWorktree: true`: each worktree owns its own snapshots in its own DB fork,
// so the sweep must run in every worktree backend (each over its own rows).
export const bootTraceRetention = defineRetention({
  table: _bootTraces,
  ttlDays: 30,
  cron: "0 3 * * *",
  perWorktree: true,
});
