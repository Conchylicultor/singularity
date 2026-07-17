import { and, eq, ilike, or, type SQL } from "drizzle-orm";
import type { PgSelect } from "drizzle-orm/pg-core";
import { db } from "@plugins/database/server";
import { currentWorktreeName } from "@plugins/infra/plugins/paths/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { resolveFieldFilterSql } from "@plugins/fields/plugins/server-capabilities/server";
import type { SortRule } from "@plugins/primitives/plugins/data-view/core";
import {
  augmentServerQuery,
  buildSortKeys,
  compileWhere,
  keyValuesOf,
  orderByClauses,
  seekPredicate,
  type FieldColumnMap,
  type OperatorSqlResolver,
} from "@plugins/primitives/plugins/data-view/plugins/server-query/server";
import {
  decodeCursor,
  encodeCursor,
  sortSignature,
} from "@plugins/primitives/plugins/data-view/plugins/server-query/core";
import type { ReleaseRun } from "../../core";
import { queryReleaseHistory } from "../../core";
import { _releaseRuns } from "./tables";

// The public wire projection: every `release_runs` column EXCEPT `pid` (an
// internal liveness marker, never part of ReleaseRun). Mirrors what
// `release-history-resource.ts` selects. `release_runs` is a plain `pgTable`
// (not a `pgView`), so we spread this explicit map — not the `viewColumns(view)`
// symbol hack the conversations handler needs for its `pgView` source — and add
// the augmentors' join columns alongside it.
const WIRE_COLUMNS = {
  id: _releaseRuns.id,
  composition: _releaseRuns.composition,
  target: _releaseRuns.target,
  namespace: _releaseRuns.namespace,
  status: _releaseRuns.status,
  startedAt: _releaseRuns.startedAt,
  finishedAt: _releaseRuns.finishedAt,
  exitCode: _releaseRuns.exitCode,
  platform: _releaseRuns.platform,
  artifactPath: _releaseRuns.artifactPath,
  port: _releaseRuns.port,
  error: _releaseRuns.error,
} as const;

// Binds each filterable/sortable fieldId → its physical `release_runs` column,
// with the field-type token (resolving the operator→SQL builder) and `nullable`
// for the null-aware keyset seek. Unmapped filter/sort fields are dropped
// fail-soft by the compiler — never a 400.
const COLUMN_MAP: FieldColumnMap = {
  target: { col: _releaseRuns.target, type: "text" },
  status: { col: _releaseRuns.status, type: "enum" },
  platform: { col: _releaseRuns.platform, type: "enum", nullable: true },
  startedAt: { col: _releaseRuns.startedAt, type: "date" },
  finishedAt: { col: _releaseRuns.finishedAt, type: "date", nullable: true },
};

// Default order when the client sends no sort: newest run first.
const DEFAULT_SORT: SortRule[] = [{ fieldId: "startedAt", direction: "desc" }];

// Escape LIKE wildcards so a user search term is matched literally (backslash is
// Postgres ILIKE's default escape char).
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

// Quick search: ILIKE over composition / target / platform. Blank query →
// undefined (no fragment).
function searchWhere(query: string): SQL | undefined {
  const trimmed = query.trim();
  if (!trimmed) return undefined;
  const needle = `%${escapeLike(trimmed)}%`;
  return or(
    ilike(_releaseRuns.composition, needle),
    ilike(_releaseRuns.target, needle),
    ilike(_releaseRuns.platform, needle),
  );
}

// Field-type-agnostic: the SQL for each (type, operator) pair comes from the
// fields registry; an unknown pair resolves to `null` → that rule is dropped.
const resolver: OperatorSqlResolver = (typeId, operatorId) =>
  resolveFieldFilterSql(typeId, operatorId) ?? null;

export const handleHistoryQuery = implement(queryReleaseHistory, async ({ body }) => {
  const { filter, query, cursor, limit } = body;
  // Substitute the default order when the client sends no sort, and use the same
  // effective sort everywhere (keys, signature, augmentors) so cursors stay
  // consistent across pages.
  const sort = body.sort.length > 0 ? body.sort : DEFAULT_SORT;

  // Fold in the generic server-side augmentors (custom columns, …). Each binds
  // its aliased columns into `columnMap` (so sort/filter/seek reach them), a
  // `LEFT JOIN` thunk, and a projection (so `keyValuesOf` can mint the cursor).
  // `rowKeyCol` must be the column whose value == the web `rowKey(row)` (here
  // `_releaseRuns.id`, matching `rowKey={r => r.id}`).
  const aug = await augmentServerQuery({
    dataViewId: body.dataViewId,
    rowKeyCol: _releaseRuns.id,
    sort,
    filter,
  });
  const columnMap = { ...COLUMN_MAP, ...aug.columnMap };

  // Always append PK `id asc` as a total-order tiebreaker so the keyset seek is
  // strict (gap-free / dup-free) even across the NULLS-LAST boundary.
  const keys = buildSortKeys(sort, columnMap, { col: _releaseRuns.id, fieldId: "id" });

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
    // Scoped to this namespace's own runs: a worktree DB inherits main's rows via
    // the fork, so without this filter every worktree would surface main's runs.
    eq(_releaseRuns.namespace, currentWorktreeName()),
    eq(_releaseRuns.composition, body.composition),
    searchWhere(query),
    compileWhere(filter, columnMap, resolver),
    seek,
  );

  // Explicit flat projection (wire columns + the augmentors' sort-key columns)
  // over a `$dynamic()` query so the augmentors' joins can be applied.
  let q: PgSelect = db
    .select({ ...WIRE_COLUMNS, ...aug.projection })
    .from(_releaseRuns)
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

  // Strip the custom projection keys before returning (mirrors the conversations
  // handler): `ReleaseRunSchema` strips unknown keys anyway, but doing it here
  // keeps the wire lean and the shape explicit.
  const ccKeys = Object.keys(aug.projection);
  const items = rawItems.map((r) => {
    const c = { ...r } as Record<string, unknown>;
    for (const k of ccKeys) delete c[k];
    return c;
  }) as unknown as ReleaseRun[];

  return { items, nextCursor, hasMore };
});
