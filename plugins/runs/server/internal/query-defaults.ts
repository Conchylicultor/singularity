import { resolveFieldFilterSql } from "@plugins/fields/plugins/server-capabilities/server";
import type { SortRule } from "@plugins/primitives/plugins/data-view/core";
import type { OperatorSqlResolver } from "@plugins/primitives/plugins/data-view/plugins/server-query/server";

/**
 * What both reads of the merged run space compile with.
 *
 * There are two — the window (`handle-query`) and the single row
 * (`handle-get`) — and they must produce a row of the same shape from the same
 * ledger. Sort is the one that can silently disagree: `compileUnionPage` derives
 * the ordering keys and the cursor signature from it, so a by-id read declaring
 * its own sort would compile a different statement to answer a question the two
 * surfaces think is the same. Declared once here, they cannot drift.
 */

// Newest first when the client sends no sort — the only order a "what is
// happening" surface can open on.
export const DEFAULT_SORT: SortRule[] = [
  { fieldId: "startedAt", direction: "desc" },
];

// Field-type agnostic: the SQL for each (type, operator) pair comes from the
// fields registry; an unknown pair resolves to `null` → that rule is dropped.
export const resolver: OperatorSqlResolver = (typeId, operatorId) =>
  resolveFieldFilterSql(typeId, operatorId) ?? null;
