import { defineRetention } from "@plugins/infra/plugins/retention/server";
import { _opLogOps } from "./tables";

// `op_log_ops` gains one row per op the host runs and only ever grows. Thirty
// days covers every question the Ops Gantt and the push stats ask; the file's
// own rotation is the deeper (and shorter) archive. This `defineRetention` IS
// the table's growth bound — recorded only when mounted in `register`.
//
// Swept on `requested_at`: an op killed mid-flight never gets a `completed_at`.
// `perWorktree: true`: the table lives in every worktree's DB fork, each
// ingesting (and so growing) on its own.
export const opLogOpsRetention = defineRetention({
  table: _opLogOps,
  column: "requestedAt",
  ttlDays: 30,
  perWorktree: true,
});
