import { and, eq, ilike, or, type SQL } from "drizzle-orm";
import type { PgSelect } from "drizzle-orm/pg-core";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { resolveFieldFilterSql } from "@plugins/fields/plugins/server-capabilities/server";
import type { SortRule } from "@plugins/primitives/plugins/data-view/core";
import {
  augmentServerQuery,
  compileWhere,
  type FieldColumnMap,
  type OperatorSqlResolver,
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
import { queryDeployRuns } from "../../core/endpoints";
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

// Binds each filterable/sortable fieldId → its physical `deploy_runs` column, with
// the field-type token (resolving the operator→SQL builder) and `nullable` for the
// null-aware keyset seek. Unmapped filter/sort fields are dropped fail-soft by the
// compiler — never a 400.
const COLUMN_MAP: FieldColumnMap = {
  verb: { col: _deployRuns.verb, type: "enum" },
  status: { col: _deployRuns.status, type: "enum" },
  releaseRunId: { col: _deployRuns.releaseRunId, type: "text", nullable: true },
  commitSha: { col: _deployRuns.commitSha, type: "text", nullable: true },
  startedAt: { col: _deployRuns.startedAt, type: "date" },
  finishedAt: { col: _deployRuns.finishedAt, type: "date", nullable: true },
};

// Default order when the client sends no sort: newest run first.
const DEFAULT_SORT: SortRule[] = [{ fieldId: "startedAt", direction: "desc" }];

// Escape LIKE wildcards so a user search term is matched literally (backslash is
// Postgres ILIKE's default escape char).
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

// Quick search: ILIKE over the release run id, the commit and the failure message
// — "which deploy shipped a1b2c3d" and "which one printed that error" are the two
// things anyone reaches for. Blank query → undefined (no fragment).
function searchWhere(query: string): SQL | undefined {
  const trimmed = query.trim();
  if (!trimmed) return undefined;
  const needle = `%${escapeLike(trimmed)}%`;
  return or(
    ilike(_deployRuns.releaseRunId, needle),
    ilike(_deployRuns.commitSha, needle),
    ilike(_deployRuns.message, needle),
  );
}

// Field-type-agnostic: the SQL for each (type, operator) pair comes from the
// fields registry; an unknown pair resolves to `null` → that rule is dropped.
const resolver: OperatorSqlResolver = (typeId, operatorId) =>
  resolveFieldFilterSql(typeId, operatorId) ?? null;

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
    const { filter, query, cursor, limit } = body;
    // Substitute the default order when the client sends no sort, and use the same
    // effective sort everywhere (keys, signature, augmentors) so cursors stay
    // consistent across pages.
    const sort = body.sort.length > 0 ? body.sort : DEFAULT_SORT;

    // Fold in the generic server-side augmentors (custom columns, …). Each binds its
    // aliased columns into `columnMap` (so sort/filter/seek reach them), a `LEFT JOIN`
    // thunk, and a projection (so `keyValuesOf` can mint the cursor). `rowKeyCol` must
    // be the column whose value == the web `rowKey(row)` (here `_deployRuns.id`).
    const aug = await augmentServerQuery({
      dataViewId: body.dataViewId,
      rowKeyCol: _deployRuns.id,
      sort,
      filter,
    });
    const columnMap = { ...COLUMN_MAP, ...aug.columnMap };

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
      searchWhere(query),
      compileWhere(filter, columnMap, resolver),
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
