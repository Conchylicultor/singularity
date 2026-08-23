import { z } from "zod";
import type { TimelineEvent } from "../../../core";
import { overlapsWindow } from "../window";
import { traceSeverity } from "../severity";
import {
  defineDbSource,
  type DbSource,
  type DbSourceCtx,
  type SqlQuery,
} from "./context";

// A trace is persisted after its async enrich, so created_at can trail the
// snapshot's wallTime anchor by seconds-to-minutes — and under a saturated
// host (exactly when traces matter) convoy-delayed persists exceed several
// minutes. The SQL range filter on the indexed created_at is only a coarse
// pre-filter widened by this slack — the exact wall-clock overlap check
// happens in map() — so a generous 30 min costs a few extra rows read and
// discarded, never false events.
const ENRICH_SLACK_MS = 30 * 60 * 1000;

// The JSON extractions pull only the three scalars the interval mapping needs
// — never the (potentially tens-of-KB) snapshot blob itself. `duration_ms` is
// float8 and the two `->>` extractions are cast to double precision, so all
// three really are numbers; `created_at` is timestamptz, which node-postgres
// decodes to a Date. Nothing here needs coercing.
const RawTraceRowSchema = z.object({
  id: z.string(),
  worktree: z.string(),
  trigger_kind: z.string(),
  trigger_label: z.string(),
  duration_ms: z.number(),
  created_at: z.date(),
  wall_time: z.string().nullable(),
  at_ms: z.number().nullable(),
  window_start_ms: z.number().nullable(),
  critical: z.boolean().nullable(),
});
export type TraceRow = z.infer<typeof RawTraceRowSchema>;

function buildTracesQuery(ctx: DbSourceCtx): SqlQuery {
  // Fork DBs inherit main's rows at fork time; scoping to the fork's own
  // worktree keeps main's traces from appearing once per fork. The main DB is
  // the authority for everything else and stays unfiltered.
  const worktreeFilter = ctx.isMainDb ? "" : "AND worktree = $3";
  return {
    text: `
      SELECT id, worktree, trigger_kind, trigger_label, duration_ms, created_at,
             snapshot->>'wallTime' AS wall_time,
             (snapshot->>'atMs')::double precision AS at_ms,
             (snapshot->>'windowStartMs')::double precision AS window_start_ms,
             (snapshot->'trigger'->>'critical')::boolean AS critical
      FROM traces
      WHERE created_at >= to_timestamp($1::double precision / 1000.0)
        AND created_at <= to_timestamp(($2::double precision + ${ENRICH_SLACK_MS}) / 1000.0)
        ${worktreeFilter}
    `,
    values: ctx.isMainDb
      ? [ctx.fromMs, ctx.toMs]
      : [ctx.fromMs, ctx.toMs, ctx.dbName],
  };
}

export function mapTraceRows(
  rows: TraceRow[],
  ctx: DbSourceCtx,
): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  for (const row of rows) {
    // wallTime is the single profiler→wall join point (engine clock
    // discipline); the captured window span is a profiler-clock DURATION, so
    // it transfers to the wall clock as-is.
    const endMs =
      row.wall_time !== null
        ? Date.parse(row.wall_time)
        : row.created_at.getTime();
    if (Number.isNaN(endMs)) {
      throw new Error(
        `traces row ${row.id}: unparseable snapshot wallTime ${row.wall_time}`,
      );
    }
    const windowSpanMs =
      row.at_ms !== null && row.window_start_ms !== null
        ? row.at_ms - row.window_start_ms
        : row.duration_ms;
    const startMs = endMs - Math.max(windowSpanMs, 0);
    if (!overlapsWindow(startMs, endMs, ctx.fromMs, ctx.toMs)) continue;
    events.push({
      id: `trace:${row.id}`,
      source: "trace",
      worktree: row.worktree,
      startMs,
      endMs,
      label: `${row.trigger_kind}: ${row.trigger_label}`,
      severity: traceSeverity(row.critical ?? false),
      traceId: row.id,
      detail: {
        triggerKind: row.trigger_kind,
        triggerLabel: row.trigger_label,
        durationMs: row.duration_ms,
        windowSpanMs,
      },
    });
  }
  return events;
}

export const tracesSource: DbSource = defineDbSource({
  source: "trace",
  build: buildTracesQuery,
  row: RawTraceRowSchema,
  map: mapTraceRows,
});
