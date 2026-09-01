import { db } from "@plugins/database/server";
import { executeRows } from "@plugins/database/plugins/sql-rows/core";
import { HttpError, implement } from "@plugins/infra/plugins/endpoints/server";
import { compileUnionPage } from "@plugins/primitives/plugins/data-view/plugins/union-query/server";
import { UnionCursorMismatchError } from "@plugins/primitives/plugins/data-view/plugins/union-query/core";
import { encodeCursor } from "@plugins/primitives/plugins/keyset/core";
import { keyValuesOf } from "@plugins/primitives/plugins/keyset/server";
import {
  queryRuns,
  RUN_BASE_COLUMNS,
  RUN_SEARCH_COLUMNS,
  UnionRunSchema,
  type UnionRun,
} from "../../core";
import { armFieldSpecs, runArms } from "./arms";
import { DEFAULT_SORT, resolver } from "./query-defaults";
import { getRunKinds } from "./registry";

/**
 * One window of the merged run space.
 *
 * Everything domain-specific about it is read off the registry: the arms, their
 * extra columns and their scopes. Adding a run kind therefore changes nothing
 * here — which is the test of whether the collection-consumer separation
 * actually holds.
 *
 * The row window is NOT verified against anything first. An arm's ledger being
 * empty and no arm being registered are the same empty page, and there is no
 * refusal that would tell a caller anything a zero-row response does not.
 */
export const handleRunsQuery = implement(queryRuns, async ({ body }) => {
  const kinds = getRunKinds();
  // Use the same effective sort everywhere (keys, signature, seek) so cursors
  // stay consistent across pages.
  const sort = body.sort.length > 0 ? body.sort : DEFAULT_SORT;

  let compiled;
  try {
    compiled = compileUnionPage({
      arms: runArms(kinds),
      base: RUN_BASE_COLUMNS,
      extra: armFieldSpecs(kinds),
      tiebreaker: { fieldId: "id" },
      resolveOperator: resolver,
      sort,
      filter: body.filter,
      query: body.query,
      searchFields: RUN_SEARCH_COLUMNS,
      cursor: body.cursor,
      // One extra row is how `hasMore` is known without a second count query.
      limit: body.limit + 1,
    });
  } catch (err) {
    // A cursor minted under a different sort is a stale client, not a server
    // fault. Everything else is a bug and stays a loud 500.
    if (err instanceof UnionCursorMismatchError) {
      throw new HttpError(400, err.message);
    }
    throw err;
  }

  const rows = await executeRows(db, {
    query: compiled.sql,
    row: UnionRunSchema,
    label: "runs.query",
  });

  const hasMore = rows.length > body.limit;
  const items: UnionRun[] = rows.slice(0, body.limit);

  const last = items.at(-1);
  const nextCursor =
    hasMore && last
      ? encodeCursor(
          keyValuesOf(
            last as unknown as Record<string, unknown>,
            compiled.keys,
          ),
          compiled.sortSignature,
        )
      : null;

  return { items, nextCursor, hasMore };
});
