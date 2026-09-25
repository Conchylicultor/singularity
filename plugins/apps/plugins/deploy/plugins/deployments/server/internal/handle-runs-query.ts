import { and, eq, type SQL } from "drizzle-orm";
import type { PgSelect } from "drizzle-orm/pg-core";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import type { SortRule } from "@plugins/primitives/plugins/data-view/core";
import {
  augmentServerQuery,
  bindColumns,
  compileWhere,
  type FieldColumnMap,
} from "@plugins/primitives/plugins/data-view/plugins/server-query/server";
import {
  buildSortKeys,
  keyValuesOf,
  orderByClauses,
  seekPredicate,
} from "@plugins/primitives/plugins/keyset/server";
import {
  decodeCursor,
  encodeCursor,
  sortSignature,
} from "@plugins/primitives/plugins/keyset/core";
import { DEPLOY_RUN_FILTERABLE, queryDeployRuns } from "../../core/endpoints";
import type { DeployRunRecord } from "../../core/runs";
import { _deployRuns } from "./tables";

// The public wire projection — the `deploy_runs` columns a client may see, in one
// place, so a new column reaches the endpoint by being added here rather than at
// each read site.
//
// Three are deliberately withheld, and this is where they stop: `pid`,
// `leg_run_id` and `launched_from` are the supervised-run bookkeeping that lets a
// restarted backend find the CLI child it left behind (see `tables.ts`). They say
// nothing about what went onto the box, and `pid` in particular is a
// process-local number that means nothing to a reader — the same call
// `release_runs.pid` makes.
const DEPLOY_RUN_WIRE_COLUMNS = {
  id: _deployRuns.id,
  deploymentId: _deployRuns.deploymentId,
  serverId: _deployRuns.serverId,
  compositionId: _deployRuns.compositionId,
  verb: _deployRuns.verb,
  releaseRunId: _deployRuns.releaseRunId,
  commitSha: _deployRuns.commitSha,
  status: _deployRuns.status,
  phaseFailed: _deployRuns.phaseFailed,
  startedAt: _deployRuns.startedAt,
  finishedAt: _deployRuns.finishedAt,
  exitCode: _deployRuns.exitCode,
  message: _deployRuns.message,
};

// Binds every DEPLOY_RUN_FILTERABLE column → its `deploy_runs` column (domain
// copied from the declaration; a declared column with no binding is a tsc
// error), with `nullable` for the null-aware keyset seek. A filter naming
// anything else is refused with a 400 — never dropped.
const COLUMN_MAP: FieldColumnMap = bindColumns(DEPLOY_RUN_FILTERABLE, {
  verb: { col: _deployRuns.verb },
  status: { col: _deployRuns.status },
  releaseRunId: { col: _deployRuns.releaseRunId, nullable: true },
  commitSha: { col: _deployRuns.commitSha, nullable: true },
  message: { col: _deployRuns.message, nullable: true },
  startedAt: { col: _deployRuns.startedAt },
  finishedAt: { col: _deployRuns.finishedAt, nullable: true },
});

// Default order when the client sends no sort: newest run first.
const DEFAULT_SORT: SortRule[] = [{ fieldId: "startedAt", direction: "desc" }];

/**
 * One window of a deployment's run ledger, newest first — the `queryReleaseHistory`
 * shape, scoped by the route's deployment rather than by a body field.
 *
 * The deployment is NOT verified to exist first: the ledger is FK'd to it with
 * `ON DELETE CASCADE`, so "no such deployment" and "no runs" are the same empty
 * window, and a 404 here would only be a second, slower way to say it.
 */
export const handleRunsQuery = implement(
  queryDeployRuns,
  async ({ params, body }) => {
    const { cursor, limit } = body;
    // Substitute the default order when the client sends no sort, and use the same
    // effective sort everywhere (keys, signature, augmentors) so cursors stay
    // consistent across pages.
    const sort = body.sort.length > 0 ? body.sort : DEFAULT_SORT;

    // Decode the filter strictly (400 on anything undeclared) and fold in the
    // generic server-side augmentors (custom columns, …): the referenced ones bind
    // their aliased columns into `columnMap` (so sort/filter/seek reach them), a
    // `LEFT JOIN` thunk, and a projection (so `keyValuesOf` can mint the cursor).
    // `rowKeyCol` must be the column whose value == the web `rowKey(row)` (here
    // `_deployRuns.id`).
    const aug = await augmentServerQuery({
      dataViewId: body.dataViewId,
      rowKeyCol: _deployRuns.id,
      sort,
      filter: body.filter,
      columnMap: COLUMN_MAP,
    });
    const columnMap = aug.columnMap;

    // Always append PK `id asc` as a total-order tiebreaker so the keyset seek is
    // strict (gap-free / dup-free) even across the NULLS-LAST boundary.
    const keys = buildSortKeys(sort, columnMap, {
      col: _deployRuns.id,
      fieldId: "id",
    });

    let seek: SQL | undefined;
    if (cursor) {
      const payload = decodeCursor(cursor);
      // Backstop: a cursor minted under a different sort must not be replayed
      // against this request's ordering (would dup/skip rows).
      if (payload.s !== sortSignature(sort)) {
        throw new HttpError(400, "Cursor sort signature mismatch");
      }
      seek = seekPredicate(keys, payload.v);
    }

    const where = and(
      eq(_deployRuns.deploymentId, params.id),
      compileWhere(aug.filter, columnMap),
      seek,
    );

    // Explicit flat projection (wire columns + the augmentors' sort-key columns) over
    // a `$dynamic()` query so the augmentors' joins can be applied.
    let q: PgSelect = db
      .select({ ...DEPLOY_RUN_WIRE_COLUMNS, ...aug.projection })
      .from(_deployRuns)
      .$dynamic();
    for (const j of aug.joins) q = j.apply(q);
    const rows = await q
      .where(where)
      .orderBy(...orderByClauses(keys))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const rawItems = rows.slice(0, limit);

    // Compute the cursor from the RAW last row — it still carries the custom
    // projection keys `keyValuesOf` reads to mint the keyset cursor.
    const lastRaw = rawItems.at(-1);
    const nextCursor =
      hasMore && lastRaw
        ? encodeCursor(
            keyValuesOf(lastRaw as unknown as Record<string, unknown>, keys),
            sortSignature(sort),
          )
        : null;

    // Strip the custom projection keys before returning: the response schema strips
    // unknown keys anyway, but doing it here keeps the wire lean and the shape explicit.
    const ccKeys = Object.keys(aug.projection);
    const items = rawItems.map((r) => {
      const c = { ...r } as Record<string, unknown>;
      for (const k of ccKeys) delete c[k];
      return c;
    }) as unknown as DeployRunRecord[];

    return { items, nextCursor, hasMore };
  },
);
