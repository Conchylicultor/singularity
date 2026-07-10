import { z } from "zod";
import type { TimelineEvent } from "../../../core";
import { reportSeverity } from "../severity";
import type { DbSource, DbSourceCtx, SqlQuery } from "./context";

// A report row is a deduped (fingerprint, worktree) aggregate; on the timeline
// it renders as a POINT event at its last occurrence within the window
// (startMs === endMs === lastSeenAt).
const RawReportRowSchema = z.object({
  id: z.string(),
  worktree: z.string(),
  kind: z.string(),
  source: z.string(),
  message: z.string(),
  noise: z.boolean(),
  count: z.coerce.number(),
  trace_id: z.string().nullable(),
  last_seen_at: z.coerce.date(),
});

function buildReportsQuery(ctx: DbSourceCtx): SqlQuery {
  // Same fork-inherited-row scoping as the traces source.
  const worktreeFilter = ctx.isMainDb ? "" : "AND worktree = $3";
  return {
    text: `
      SELECT id, worktree, kind, source, message, noise, count,
             data->>'traceId' AS trace_id, last_seen_at
      FROM reports
      WHERE last_seen_at >= to_timestamp($1::double precision / 1000.0)
        AND last_seen_at <= to_timestamp($2::double precision / 1000.0)
        ${worktreeFilter}
    `,
    values: ctx.isMainDb ? [ctx.fromMs, ctx.toMs] : [ctx.fromMs, ctx.toMs, ctx.dbName],
  };
}

export function mapReportRows(rows: unknown[], _ctx: DbSourceCtx): TimelineEvent[] {
  return rows.map((raw) => {
    const row = RawReportRowSchema.parse(raw);
    const atMs = row.last_seen_at.getTime();
    return {
      id: `report:${row.id}`,
      source: "report" as const,
      worktree: row.worktree,
      startMs: atMs,
      endMs: atMs,
      label: row.message,
      severity: reportSeverity(row.kind, row.noise),
      ...(row.trace_id !== null ? { traceId: row.trace_id } : {}),
      detail: {
        kind: row.kind,
        reportSource: row.source,
        count: row.count,
        noise: row.noise,
      },
    };
  });
}

export const reportsSource: DbSource = {
  source: "report",
  build: buildReportsQuery,
  map: mapReportRows,
};
