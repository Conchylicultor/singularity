import { and, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { resolveFieldValueTextCast } from "@plugins/fields/plugins/server-capabilities/server";
import {
  DataViewServer,
  type AugmentedColumn,
  type QueryAugmentor,
  type QueryAugmentorContext,
} from "@plugins/primitives/plugins/data-view/plugins/server-query/server";
import { readCustomColumnDefs } from "../../shared/read-custom-column-defs";
import { _dataViewCustomValues } from "./tables";

/** `cc-…` ids carry a hyphen — sanitize to a SQL-safe alias name. */
function sanitizeAlias(id: string): string {
  return `dvcv_${id.replace(/[^a-zA-Z0-9]/g, "_")}`;
}

/**
 * Custom-columns' server field-extension augmentor. Offers every custom column
 * of the surface: a `LEFT JOIN` of the generic `data_view_custom_values`
 * side-table (aliased per column) on `(dataViewId, columnId, rowKey =
 * rowKeyCol::text)`, and a binding of its `value` column under the `cc-*` id —
 * presented through the def type's text cast, in the domain that cast reads in
 * (`resolveFieldValueTextCast`; a string type reads raw TEXT, domain `text`).
 * `augmentServerQuery` joins only the columns the request's sort or filter
 * names, so unused custom columns cost nothing.
 */
const customColumnsAugmentor: QueryAugmentor = (ctx: QueryAugmentorContext) => {
  const defs = readCustomColumnDefs(ctx.config.customColumns);
  const offered: Record<string, AugmentedColumn> = {};
  const usedAliases = new Set<string>();
  for (const def of defs) {
    // Ensure a unique alias if two ids collapse to the same sanitized name.
    let name = sanitizeAlias(def.id);
    if (usedAliases.has(name)) {
      let i = 2;
      while (usedAliases.has(`${name}_${i}`)) i++;
      name = `${name}_${i}`;
    }
    usedAliases.add(name);

    const t = alias(_dataViewCustomValues, name);
    const read = resolveFieldValueTextCast(def.type);
    offered[def.id] = {
      join: {
        apply: (q) =>
          q.leftJoin(
            t,
            and(
              eq(t.dataViewId, ctx.dataViewId),
              eq(t.columnId, def.id),
              eq(t.rowKey, sql`${ctx.rowKeyCol}::text`),
            ),
          ),
      },
      // `ColumnBinding.col` is a `ColumnExpr`, which says out loud that a cast
      // SQL stands in for a column here.
      binding: {
        col: read.cast ? read.cast(t.value) : t.value,
        domain: read.domain,
        nullable: true,
      },
    };
  }
  return offered;
};

/** The self-registering contribution wired into the plugin's `contributions`. */
export const customColumnsQueryAugmentor = DataViewServer.QueryAugmentor({
  augment: customColumnsAugmentor,
});
