import { z } from "zod";
import type { ZodParser } from "@plugins/packages/plugins/zod-parser/core";
import type {
  BackupSourceReport,
  BackupTargetResult,
} from "@plugins/backup/core";
import type { UnionRun } from "@plugins/runs/core";

/**
 * The two jsonb columns this arm projects, decoded.
 *
 * `runs/web`'s `armText` / `armNumber` / … cover every scalar arm column; a
 * jsonb one has no accessor there and needs a real decoder anyway, so these are
 * it. Same two rules as those accessors: a shape the SQL did not produce throws,
 * and an absent column is not an error — an empty list reads identically to
 * "this run has none", which is what a `running` row and another kind's row
 * both are.
 *
 * Both schemas are a second spelling of ones `backup` already owns —
 * deliberately, and the only option: the originals decode these columns inside
 * `backup/shared`, which is plugin-private and unreachable across a plugin
 * boundary. What keeps them from drifting is the annotation: each output is
 * pinned to the interface `backup/core` exports, which IS importable, so a field
 * renamed in the shared shape stops compiling here rather than quietly
 * disappearing from the row.
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

function armJson(run: UnionRun, id: string): unknown {
  return (run as unknown as Record<string, unknown>)[id];
}

/** The run's per-target outcomes, read off the merged row. */
export function backupTargetResults(run: UnionRun): BackupTargetResult[] {
  const raw = armJson(run, "backup.targetResults");
  if (raw === null || raw === undefined) return [];
  return z.array(BackupTargetResultSchema).parse(raw);
}

/**
 * The sources that actually went into the archive, read off the merged row.
 *
 * Skipped ones are dropped here rather than at the call site, because a skipped
 * source did not go into the archive and this list is what the archive holds —
 * the same reading the count column takes, so the two cannot disagree.
 */
export function backupSources(run: UnionRun): BackupSourceReport[] {
  const raw = armJson(run, "backup.sources");
  if (raw === null || raw === undefined) return [];
  return z
    .array(BackupSourceReportSchema)
    .parse(raw)
    .filter((s) => !s.skipped);
}
