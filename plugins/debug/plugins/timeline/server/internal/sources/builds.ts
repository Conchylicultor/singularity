import { z } from "zod";
import type { TimelineEvent } from "../../../core";
import { buildSeverity } from "../severity";
import type { DbSource, DbSourceCtx, SqlQuery } from "./context";

const RawBuildRowSchema = z.object({
  id: z.string(),
  trigger: z.string(),
  commit_hash: z.string().nullable(),
  started_at: z.coerce.date(),
  finished_at: z.coerce.date().nullable(),
  exit_code: z.coerce.number().nullable(),
});

function buildBuildsQuery(ctx: DbSourceCtx): SqlQuery {
  // build_runs is fork-inherited like every table, and unlike traces/reports
  // its rows carry `namespace` rather than `worktree`. Every DB — main
  // included — scopes to its own namespace (namespace === dbName by the same
  // identity mapping), so inherited main builds never surface per fork.
  return {
    text: `
      SELECT id, trigger, commit_hash, started_at, finished_at, exit_code
      FROM build_runs
      WHERE namespace = $3
        AND started_at <= to_timestamp($2::double precision / 1000.0)
        AND (finished_at IS NULL OR finished_at >= to_timestamp($1::double precision / 1000.0))
    `,
    values: [ctx.fromMs, ctx.toMs, ctx.dbName],
  };
}

export function mapBuildRows(rows: unknown[], ctx: DbSourceCtx): TimelineEvent[] {
  return rows.map((raw) => {
    const row = RawBuildRowSchema.parse(raw);
    // An in-flight build (finished_at IS NULL — including a crashed build the
    // reconciler hasn't stamped yet) renders as an open-ended bar to the
    // window's right edge.
    const inFlight = row.finished_at === null;
    const startMs = row.started_at.getTime();
    const endMs = row.finished_at === null ? ctx.toMs : row.finished_at.getTime();
    return {
      id: `build:${row.id}`,
      source: "build" as const,
      worktree: ctx.dbName,
      startMs,
      endMs,
      label: `build (${row.trigger})`,
      severity: buildSeverity(row.exit_code),
      detail: {
        trigger: row.trigger,
        commitHash: row.commit_hash,
        exitCode: row.exit_code,
        inFlight,
      },
    };
  });
}

export const buildsSource: DbSource = {
  source: "build",
  build: buildBuildsQuery,
  map: mapBuildRows,
};
