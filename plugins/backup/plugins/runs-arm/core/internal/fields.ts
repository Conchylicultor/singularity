import { z } from "zod";
import { liveArmColumns } from "@plugins/network/plugins/live/core";
import {
  liveNumber,
  liveText,
} from "@plugins/network/plugins/live/plugins/filter/core";
import { BACKUP_RUN_KIND } from "@plugins/backup/core";
import { runs } from "@plugins/runs/core";
import {
  BackupSourceReportSchema,
  BackupTargetResultSchema,
} from "./payload-schemas";
import { BACKUP_RUN_STATUSES, type BackupRunStatus } from "./status";

/**
 * The columns only a backup run has — its slice of the `runs` union
 * (`$columns.backup`), wire names `backup.<field>`.
 *
 * `status` is the arm's **native** status, kept beside the shared `outcome`
 * rather than instead of it — and the reason the shared vocabulary has a
 * `partial` at all: a backup that reached three of four targets is neither a
 * success nor a failure.
 *
 * `targetResults` and `sources` are the raw jsonb columns the detail pane
 * reads — *which* target failed and what it said, and what went into the
 * archive. Neither filters nor sorts: a blob has no comparable projection.
 * Both are bounded by things a person configures (targets, sources).
 */
export const backupRunColumns = liveArmColumns(runs, BACKUP_RUN_KIND, {
  row: z.object({
    /** `running` / `ok` / `partial` / `failed` — the arm's own vocabulary. */
    status: z.enum(
      BACKUP_RUN_STATUSES as [BackupRunStatus, ...BackupRunStatus[]],
    ),
    /** Archive bytes. Null while the run has not produced an archive yet. */
    archiveSize: z.number().nullable(),
    /** Sources that actually went in (skipped ones excluded). Null pre-manifest. */
    sourceCount: z.number().nullable(),
    /** Storage targets dispatched to. Null until the run has dispatched. */
    targetCount: z.number().nullable(),
    /** Per-target outcomes, verbatim. */
    targetResults: z.array(BackupTargetResultSchema).nullable(),
    /** The manifest's source reports (v2+ array form only). */
    sources: z.array(BackupSourceReportSchema).nullable(),
  }),
  filterable: {
    status: liveText(),
    archiveSize: liveNumber(),
    sourceCount: liveNumber(),
    targetCount: liveNumber(),
  },
  sortable: ["status", "archiveSize", "sourceCount", "targetCount"],
});
