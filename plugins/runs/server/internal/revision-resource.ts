import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@plugins/database/server";
import { executeRows } from "@plugins/database/plugins/sql-rows/core";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { runsRevisionResource } from "../../core";
import { getRunKinds, type RunKind } from "./registry";

/**
 * How many of each arm's newest runs the fingerprint covers.
 *
 * Comfortably more than a first page, so the loaded window is inside it with
 * room to page once or twice before the tail goes quiet.
 */
const FINGERPRINT_WINDOW = 50;

const WindowRowSchema = z.object({
  id: z.coerce.string(),
  startedAt: z.coerce.date(),
  finishedAt: z.coerce.date().nullable(),
  // Lenient where the query endpoint is strict: the tick's job is to notice a
  // change, not to validate a row. A malformed outcome should reach the user as
  // the endpoint's loud parse error, not as a tick that stopped firing.
  outcome: z.coerce.string().nullable(),
});

/**
 * One arm's newest `FINGERPRINT_WINDOW` runs, as a string.
 *
 * **O(window), not O(collection)** — the point of the whole shape. It replaced a
 * `GROUP BY <outcome CASE>` over the entire table, which no index can serve (the
 * key is computed) and which grew with every build on a machine whose purpose is
 * running builds.
 *
 * The `CASE` still appears, but as a SELECT-list expression over 50 rows rather
 * than a grouping key over all of them, so it costs nothing.
 *
 * What it detects: inserts, deletes inside the window, and any change to a
 * hashed column — which covers two things watermarks alone miss (a second run
 * finishing in the same instant as the current `max`, and an update that touches
 * no timestamp).
 *
 * What it does not: a delete OUTSIDE the window, i.e. the retention sweep. Those
 * rows are not on the page, so the loaded window has nothing to refresh — it is
 * not a missed change so much as a change with no viewer. The real, narrow cost
 * is a reader scrolled well past the window seeing a stale tail until the next
 * in-window change; old runs are finished and do not change, so that tail is
 * stable by nature.
 *
 * No `.sort()`: `ORDER BY` already fixes the order, so the string is
 * deterministic without one.
 */
async function armWindow(
  kind: RunKind,
): Promise<{ fingerprint: string; hasRuns: boolean }> {
  const finished = kind.base.finishedAt ?? sql`NULL::timestamptz`;
  const scope = kind.where ? sql` WHERE ${kind.where}` : sql``;
  const rows = await executeRows(db, {
    query: sql`SELECT ${kind.base.id} AS "id",
                      ${kind.base.startedAt} AS "startedAt",
                      ${finished} AS "finishedAt",
                      ${kind.base.outcome} AS "outcome"
               FROM ${kind.table}${scope}
               ORDER BY ${kind.base.startedAt} DESC
               LIMIT ${FINGERPRINT_WINDOW}`,
    row: WindowRowSchema,
    label: `runs.revision:${kind.kind}`,
  });
  return {
    fingerprint: rows
      .map(
        (r) =>
          `${kind.kind}/${r.id}:${r.startedAt.toISOString()}:${r.finishedAt?.toISOString() ?? ""}:${r.outcome ?? ""}`,
      )
      .join(","),
    // Free: an arm's window is empty exactly when its scoped ledger is.
    hasRuns: rows.length > 0,
  };
}

/**
 * The merged run space's invalidation tick.
 *
 * It folds over the registry rather than naming a table, so a new arm starts
 * moving the tick with no edit here — the same property that makes the query
 * handler arm-blind. `dependsOn` is likewise not spelled: the loader reads each
 * arm's table through the pool, and the change feed captures that read set, so
 * the dependency graph is a consequence of the query rather than a second list
 * to keep in step with it.
 *
 * The arms are independent single-table reads, so they run CONCURRENTLY, and no
 * read-set is lost to that. The profiler holds the loader's `EntryContext` in
 * AsyncLocalStorage **by identity**, and `recordReadTables` mutates that one
 * object; every `Promise.all` branch is created inside the loader's context and
 * so accumulates into the same set, which the entry's `finally` then flushes.
 *
 * **Growth bound**: at most `FINGERPRINT_WINDOW` rows per registered arm per
 * recompute, independent of ledger size — so this resource does not grow with
 * the tables it watches.
 */
export const runsRevisionServerResource = defineResource(runsRevisionResource, {
  mode: "push",
  debounceMs: 250,
  loader: async (): Promise<{ rev: string; hasRuns: boolean }> => {
    const arms = await Promise.all(getRunKinds().map(armWindow));
    return {
      rev: createHash("sha1")
        .update(arms.map((a) => a.fingerprint).join("|"))
        .digest("hex"),
      hasRuns: arms.some((a) => a.hasRuns),
    };
  },
});
