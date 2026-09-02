import type { RunOutcome } from "@plugins/runs/plugins/run-outcome/core";

/**
 * Every value `backup_runs.status` can hold, and the shared outcome each one
 * means.
 *
 * Written as a map rather than a `CASE` in the arm's SQL, because a `CASE`
 * is a place a branch can go missing: the union query validates each row's
 * outcome against the shared vocabulary, so a status nobody mapped comes back
 * as `NULL` and throws the whole page. Here the map's value type is
 * {@link RunOutcome}, so an unmapped outcome is a `tsc` error, and the server
 * builds its `CASE` by folding over these entries — the branch set and the
 * status set are one declaration and cannot come apart.
 *
 * The four values are what the run's two writers actually write: `running` on
 * the claim, then `ok` / `partial` / `failed` from the child's own per-target
 * tally — or `failed` from `closeBackupRow`, the supervised job's backstop for
 * a child that ended without recording anything.
 *
 * `partial` maps through rather than collapsing into `failed`. Backup is the
 * only kind of run that can half-succeed — three targets of four — and that is
 * precisely why the shared vocabulary has a `partial` at all.
 */
export const BACKUP_STATUS_OUTCOME = {
  running: "running",
  ok: "succeeded",
  partial: "partial",
  failed: "failed",
} as const satisfies Record<string, RunOutcome>;

export type BackupRunStatus = keyof typeof BACKUP_STATUS_OUTCOME;

/** The native statuses, in lifecycle order — the arm's filter/group options. */
export const BACKUP_RUN_STATUSES = Object.keys(
  BACKUP_STATUS_OUTCOME,
) as BackupRunStatus[];
