import { sql, type SQL } from "drizzle-orm";
import { _backupRuns } from "@plugins/backup/server";
import { defineRunKind } from "@plugins/runs/server";
import {
  BACKUP_RUN_KIND,
  BACKUP_STATUS_OUTCOME,
  backupRunFields,
} from "../../core";

/**
 * `backup_runs.status` → the shared outcome vocabulary, folded out of the map
 * in `core/` rather than hand-written here.
 *
 * The union query validates every row's outcome against the closed vocabulary,
 * so a `CASE` that missed a native status yields `NULL` and throws the whole
 * page. Generating the branches from the map means the branch set IS the status
 * set: adding a status to `backup_runs` without saying what it means fails at
 * `tsc`, long before it can fail at query time.
 */
function outcomeExpr(): SQL {
  const branches = Object.entries(BACKUP_STATUS_OUTCOME).map(
    ([status, outcome]) => sql`when ${status}::text then ${outcome}::text`,
  );
  return sql`(case ${_backupRuns.status} ${sql.join(branches, sql` `)} end)`;
}

/**
 * How many sources actually went into the archive.
 *
 * Counts the manifest's non-skipped entries, which is the number the backup
 * card has always shown. Guarded by `jsonb_typeof`, because v1 rows stored
 * `sources` as an object rather than an array (see `BackupManifestSchema`) —
 * for those the honest answer is "unknown", not zero, and a `jsonb_array_length`
 * over an object would error the whole page rather than one row.
 */
const sourceCountExpr = sql`(case
  when jsonb_typeof(${_backupRuns.manifest} -> 'sources') = 'array' then (
    select count(*)::integer
    from jsonb_array_elements(${_backupRuns.manifest} -> 'sources') as s
    where coalesce((s ->> 'skipped')::boolean, false) = false
  )
  else null::integer
end)`;

/**
 * The manifest's source reports, in their v2 array form.
 *
 * The same `jsonb_typeof` guard as the count: v1 rows stored `sources` as an
 * object, and handing the row renderer a shape its decoder would reject reads as
 * "unknown" rather than as a crash. What the archive actually holds is the
 * non-skipped subset, and that filter lives in the decoder beside the one the
 * count applies — so the list and the number cannot disagree.
 */
const sourcesExpr = sql`(case
  when jsonb_typeof(${_backupRuns.manifest} -> 'sources') = 'array'
    then ${_backupRuns.manifest} -> 'sources'
  else null::jsonb
end)`;

/** How many storage targets the run dispatched to. Null before it dispatched. */
const targetCountExpr = sql`(case
  when jsonb_typeof(${_backupRuns.targetResults}) = 'array'
    then jsonb_array_length(${_backupRuns.targetResults})
  else null::integer
end)`;

/**
 * The backup arm of the merged run space.
 *
 * ## The two base columns that read `null`, and why
 *
 * - `namespace` — a backup is **host-global**. It archives `~/.singularity`,
 *   not a checkout, and there is no worktree it belongs to. Reading null there
 *   is the true answer; naming the worktree whose backend happened to run the
 *   job would be a fact about scheduling dressed up as a fact about the backup.
 * - `message` — a backup has no per-run failure string. What it has is a
 *   per-target one, inside `target_results`, and there is no single target
 *   whose words could stand for the run: the interesting case is precisely the
 *   one where a `partial` reached some targets and not others. Flattening that
 *   into one line would lose the only fact that matters, so it stays null here
 *   and the row renderer shows every failed target's own words.
 *
 * `label` is `Backup · N sources` — what the run covered, which is what
 * distinguishes one backup from another in a list that also holds builds and
 * deploys. The archive size is deliberately NOT in it: that is
 * `backup.archiveSize`, a real sortable column, and a label that restates a
 * column is a second place for the same number to be read off.
 */
export const backupRunKind = defineRunKind({
  kind: BACKUP_RUN_KIND,
  table: _backupRuns,
  fields: backupRunFields,
  base: {
    id: _backupRuns.id,
    label: sql`('Backup' || coalesce(' · ' || ${sourceCountExpr}::text || ' sources', ''))`,
    outcome: outcomeExpr(),
    trigger: _backupRuns.trigger,
    startedAt: _backupRuns.startedAt,
    finishedAt: _backupRuns.finishedAt,
    namespace: null,
    message: null,
  },
  extra: {
    "backup.status": _backupRuns.status,
    "backup.archiveSize": _backupRuns.archiveSizeBytes,
    "backup.sourceCount": sourceCountExpr,
    "backup.targetCount": targetCountExpr,
    "backup.targetResults": _backupRuns.targetResults,
    "backup.sources": sourcesExpr,
  },
});
