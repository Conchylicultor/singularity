import { z } from "zod";
import type { ZodParser } from "@plugins/packages/plugins/zod-parser/core";
import type {
  BackupSourceReport,
  BackupTargetResult,
} from "@plugins/backup/core";

/**
 * The two jsonb columns this arm projects, as schemas.
 *
 * Both are a second spelling of ones `backup` already owns — deliberately, and
 * the only option: the originals decode these columns inside `backup/shared`,
 * which is plugin-private. What keeps them from drifting is the annotation:
 * each output is pinned to the interface `backup/core` exports, so a field
 * renamed in the shared shape stops compiling here.
 */
export const BackupTargetResultSchema: ZodParser<BackupTargetResult> = z.object(
  {
    targetId: z.string(),
    ok: z.boolean(),
    detail: z.string().optional(),
    needsConsent: z.boolean().optional(),
    consent: z
      .object({ providerId: z.string(), scopes: z.array(z.string()) })
      .optional(),
  },
);

/** One manifest entry: an `items` or `leftOut` line. */
const SourceItemSchema = z.object({
  label: z.string(),
  detail: z.string().optional(),
  count: z.number().optional(),
});

/**
 * One source report, decoding BOTH manifest shapes — and idempotent, so the
 * server decodes the column with it and the browser re-parses its own output.
 *
 * v3 rows carry `outcome`; v2 rows carry `skipped: boolean` and have no way to
 * say a source failed at all, so the boolean maps onto `included` / `skipped`
 * losslessly. A row carrying neither is malformed and throws.
 */
export const BackupSourceReportSchema: ZodParser<BackupSourceReport> = z
  .object({
    id: z.string(),
    name: z.string(),
    outcome: z.enum(["included", "skipped", "failed"]).optional(),
    skipped: z.boolean().optional(),
    error: z.string().optional(),
    items: z.array(SourceItemSchema),
    leftOut: z.array(SourceItemSchema).optional(),
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
      ...(r.leftOut !== undefined && { leftOut: r.leftOut }),
      sizeBytes: r.sizeBytes,
    };
    if (r.outcome === "failed") {
      return {
        ...base,
        outcome: "failed",
        // A v3 writer always sets it; the fallback covers a row hand-edited or
        // written by a build between the two, and says so.
        error: r.error ?? "(the source failed without recording a reason)",
      };
    }
    if (r.outcome === "skipped" || (r.outcome === undefined && r.skipped)) {
      return { ...base, outcome: "skipped" };
    }
    return { ...base, outcome: "included" };
  });
