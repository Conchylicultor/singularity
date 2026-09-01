import { db } from "@plugins/database/server";
import { executeRows } from "@plugins/database/plugins/sql-rows/core";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { compileUnionPage } from "@plugins/primitives/plugins/data-view/plugins/union-query/server";
import {
  getRun,
  RUN_BASE_COLUMNS,
  RUN_SEARCH_COLUMNS,
  UnionRunSchema,
} from "../../core";
import { armFieldSpecs, runArmForRow } from "./arms";
import { DEFAULT_SORT, resolver } from "./query-defaults";
import { getRunKinds } from "./registry";

/**
 * One run of the merged run space, by `(kind, id)`.
 *
 * It compiles through the SAME `compileUnionPage` the list does, which is the
 * whole point: **`arms` and `extra` are independent parameters**, so this passes
 * the ONE arm that owns the kind together with EVERY arm's extra-column specs.
 * The other kinds' columns are then projected as the same typed NULLs a listed
 * row carries, and the returned row is byte-identical in shape to one off the
 * list — `armText` / `armNumber` / `armJson` decode it unchanged, and there is
 * no second row type to keep in sync.
 *
 * There is no filter, no search and no cursor: `(kind, id)` already names at
 * most one row, and `limit: 1` is the whole page. `DEFAULT_SORT` is still passed
 * — a compiled statement needs an order — and it is the list's, so the two reads
 * cannot compile different orderings of the same ledger.
 *
 * A pair naming no row returns `{ run: null }`. That is the answer, not a
 * refusal: the run may have been swept by retention, or be outside its arm's
 * always-on scope, and a 404 would make a caller guess which.
 */
export const handleRunGet = implement(getRun, async ({ params }) => {
  const kinds = getRunKinds();

  const compiled = compileUnionPage({
    arms: runArmForRow(kinds, params.kind, params.id),
    base: RUN_BASE_COLUMNS,
    extra: armFieldSpecs(kinds),
    tiebreaker: { fieldId: "id" },
    resolveOperator: resolver,
    sort: DEFAULT_SORT,
    filter: null,
    query: "",
    searchFields: RUN_SEARCH_COLUMNS,
    cursor: null,
    limit: 1,
  });

  const rows = await executeRows(db, {
    query: compiled.sql,
    row: UnionRunSchema,
    label: "runs.get",
  });

  return { run: rows[0] ?? null };
});
