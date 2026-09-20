import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import type { ZodParser } from "@plugins/packages/plugins/zod-parser/core";
import type { BackupSourceReport } from "@plugins/backup/core";

export const RunBackupResultSchema = z.object({
  ok: z.literal(true),
  jobId: z.string(),
});
export type RunBackupResult = z.infer<typeof RunBackupResultSchema>;

export const runBackup = defineEndpoint({
  route: "POST /api/backup/run",
  response: RunBackupResultSchema,
});

/**
 * One source report, decoding BOTH manifest shapes.
 *
 * v3 rows carry `outcome`; v2 rows carry `skipped: boolean` and have no way to
 * say a source failed at all, so the boolean maps onto `included` / `skipped`
 * losslessly. A row carrying neither is malformed and throws — the tolerance
 * here is for a shape this repo really wrote, not for any shape at all.
 */
const BackupSourceReportSchema: ZodParser<BackupSourceReport> = z
  .object({
    id: z.string(),
    name: z.string(),
    outcome: z.enum(["included", "skipped", "failed"]).optional(),
    skipped: z.boolean().optional(),
    error: z.string().optional(),
    items: z.array(
      z.object({
        label: z.string(),
        detail: z.string().optional(),
        count: z.number().optional(),
      }),
    ),
    sizeBytes: z.number(),
  })
  .refine(
    (r) => r.outcome !== undefined || r.skipped !== undefined,
    "a source report says neither `outcome` (v3) nor `skipped` (v2)",
  )
  .transform((r): BackupSourceReport => {
    const base = {
      id: r.id,
      name: r.name,
      items: r.items,
      sizeBytes: r.sizeBytes,
    };
    if (r.outcome === "failed") {
      return {
        ...base,
        outcome: "failed",
        // A v3 writer always sets it; the fallback covers a row hand-edited or
        // written by a build between the two, and says so rather than
        // presenting a failure with no words.
        error: r.error ?? "(the source failed without recording a reason)",
      };
    }
    if (r.outcome === "skipped" || (r.outcome === undefined && r.skipped)) {
      return { ...base, outcome: "skipped" };
    }
    return { ...base, outcome: "included" };
  });

/**
 * The manifest as it is really stored — which is WIDER than `BackupManifest`,
 * deliberately: v1 rows carry `version: 1` and a fixed `sources` object, v2 rows
 * carry source reports with a `skipped` boolean, and the TS interface has always
 * declared only the newest shape. This schema is what decodes the
 * `backup_runs.manifest` column, so the column's type is derived from what the
 * rows actually hold instead of from an interface they contradict.
 */
export const BackupManifestSchema = z.object({
  version: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  createdAt: z.string(),
  trigger: z.enum(["manual", "periodic"]),
  // v2: array of source reports. v1 legacy rows stored a fixed object —
  // accept it permissively so one old row can't reject the whole list.
  sources: z.union([
    z.array(BackupSourceReportSchema),
    z.object({}).passthrough(),
  ]),
  sizeBytes: z.number(),
});

/** One target's outcome, and the decoder for `backup_runs.target_results`. */
export const BackupTargetResultSchema = z.object({
  targetId: z.string(),
  ok: z.boolean(),
  detail: z.string().optional(),
  needsConsent: z.boolean().optional(),
  consent: z
    .object({ providerId: z.string(), scopes: z.array(z.string()) })
    .optional(),
});
