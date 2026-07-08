import { isNull } from "drizzle-orm";
import { defineRetention } from "@plugins/infra/plugins/retention/server";
import { _reports } from "./tables";

// `_reports` is an unbounded-growth firehose: automatic crash / slow-op /
// render-loop / endpoint-error telemetry is deduped per (fingerprint, worktree)
// but the DISTINCT-fingerprint set grows without bound and has never had a
// retention bound. A 7-day nightly TTL sweep matches the debug.trace-cleanup
// precedent for diagnostic telemetry: reports are crash/diagnostic records,
// re-filed automatically if the underlying problem recurs.
//
// `firehose: true`: the same call both declares `_reports` a firehose AND
// provides its retention coverage, so the retention:firehose-bounded check is
// satisfied by this very policy.
//
// `perWorktree: true`: `_reports` lives in the per-worktree DB fork, so the
// sweep must run in every worktree backend (each over its own rows).
//
// `where: isNull(_reports.taskId)` — SAFETY SCOPE. A report's `taskId` is null
// until a human explicitly clicks "investigate", which creates a linked
// investigation task and stamps `taskId` (see investigate.ts). That link is the
// idempotency key: re-investigating the same report returns the existing live
// task via `existingTaskId`. Deleting a report row with a non-null `taskId`
// would sever that link, so a recurrence would file a DUPLICATE investigation
// task even while the original is still open. We cannot cheaply/ cleanly join to
// the tasks table to test whether the linked task is closed (cross-plugin
// boundary; tasks tables are plugin-private), so we take the conservative,
// purely-local predicate: only sweep reports with NO linked investigation
// (`taskId IS NULL`). This still bounds the firehose — all automatic telemetry
// starts and stays `taskId null` — while the small, human-curated investigated
// subset is retained.
export const reportsRetention = defineRetention({
  table: _reports,
  column: "createdAt",
  ttlDays: 7,
  perWorktree: true,
  firehose: true,
  where: isNull(_reports.taskId),
});
