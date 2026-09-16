import { defineRetention } from "@plugins/infra/plugins/retention/server";
import { _supervisedJobRuns } from "./tables";

/**
 * The built-in ledger's growth bound: a run is kept 30 days after it FINISHED
 * (an open row is never swept — its `finished_at` is null). Per worktree, because
 * the table is excluded from forks: every database's rows are its own backend's,
 * and only that backend sweeps them.
 */
export const supervisedJobRunsRetention = defineRetention({
  table: _supervisedJobRuns,
  column: "finishedAt",
  ttlDays: 30,
  perWorktree: true,
});
