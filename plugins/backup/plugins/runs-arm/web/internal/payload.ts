import { z } from "zod";
import type { ZodParser } from "@plugins/packages/plugins/zod-parser/core";
import type {
  BackupSourceReport,
  BackupTargetResult,
} from "@plugins/backup/core";
import { armJson, armNumber } from "@plugins/runs/web";
import type { UnionRun } from "@plugins/runs/core";
import { backupRunFields } from "../../core";

/**
 * The two jsonb columns this arm projects, decoded.
 *
 * `armJson` is the `json` member of the same `armText` / `armNumber` family the
 * arm reads every other column through: the id is checked against this arm's own
 * `defineRunArmFields` declaration, so a column that is not declared `json` — or
 * not declared at all — does not compile. What it cannot check is the shape
 * inside the blob, which is why it takes a schema; the parse IS the check, and a
 * shape the SQL did not produce throws rather than being coerced past.
 *
 * A null column is an answer, not an error: it is null on every row of every
 * other kind, and on a backup that has not got that far yet. Both decoders read
 * it as an empty list, which is what "this run has none" looks like too.
 *
 * Both schemas are a second spelling of ones `backup` already owns —
 * deliberately, and the only option: the originals decode these columns inside
 * `backup/shared`, which is plugin-private and unreachable across a plugin
 * boundary. What keeps them from drifting is the annotation: each output is
 * pinned to the interface `backup/core` exports, which IS importable, so a field
 * renamed in the shared shape stops compiling here rather than quietly
 * disappearing from the section.
 */
const BackupTargetResultSchema: ZodParser<BackupTargetResult> = z.object({
  targetId: z.string(),
  ok: z.boolean(),
  detail: z.string().optional(),
  needsConsent: z.boolean().optional(),
  consent: z
    .object({ providerId: z.string(), scopes: z.array(z.string()) })
    .optional(),
});

const BackupSourceReportSchema: ZodParser<BackupSourceReport> = z.object({
  id: z.string(),
  name: z.string(),
  skipped: z.boolean(),
  items: z.array(
    z.object({
      label: z.string(),
      detail: z.string().optional(),
      count: z.number().optional(),
    }),
  ),
  sizeBytes: z.number(),
});

const targetResultsOf = armJson(
  backupRunFields,
  "backup.targetResults",
  z.array(BackupTargetResultSchema),
);

const sourcesOf = armJson(
  backupRunFields,
  "backup.sources",
  z.array(BackupSourceReportSchema),
);

/**
 * How many bytes the archive came out to, read off the merged row.
 *
 * Bound to the same `defineRunArmFields` declaration as everything else here, so
 * a rename of the column stops compiling in both its readers — the detail pane's
 * Archive line and the DataView's Archive size column — rather than in neither.
 *
 * Null is an answer, not a gap: the column is null on every row of every other
 * kind, and on a backup that failed before it produced an archive at all. Both
 * readers render that as nothing, never as `0 B`.
 */
export const backupArchiveSize = armNumber(
  backupRunFields,
  "backup.archiveSize",
);

/** The run's per-target outcomes, read off the merged row. */
export function backupTargetResults(run: UnionRun): BackupTargetResult[] {
  return targetResultsOf(run) ?? [];
}

/**
 * The sources that actually went into the archive, read off the merged row.
 *
 * Skipped ones are dropped here rather than at the call site, because a skipped
 * source did not go into the archive and this list is what the archive holds —
 * the same reading the `sourceCount` column's `WHERE` takes on the server, so
 * the list and the number cannot disagree.
 */
export function backupSources(run: UnionRun): BackupSourceReport[] {
  return (sourcesOf(run) ?? []).filter((s) => !s.skipped);
}
