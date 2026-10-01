import { alias } from "drizzle-orm/pg-core";
import { familyMember } from "@plugins/infra/plugins/query-resource/core";
import { resolveFieldValueTextCast } from "@plugins/fields/plugins/server-capabilities/server";
import {
  DataViewServer,
  type AugmentedColumn,
  type QueryAugmentor,
  type QueryAugmentorContext,
} from "@plugins/primitives/plugins/data-view/plugins/server-query/server";
import { readCustomColumnDefs } from "../../shared/read-custom-column-defs";
import { customScopedColumns } from "./scoped-columns";
import { _dataViewCustomValues } from "./tables";

/**
 * Custom-columns' server field-extension augmentor. Offers every custom column
 * of the surface: a keyed-side join of the generic `data_view_custom_values`
 * side-table (aliased per column — the `custom` family's member join) on
 * `(dataViewId, columnId, rowKey = rowKeyCol::text)`, applied by the handler
 * through `applyJoin`, and a binding of its `value` column under the `cc-*` id —
 * presented through the def type's text cast, in the domain that cast reads in
 * (`resolveFieldValueTextCast`; a string type reads raw TEXT, domain `text`).
 * `augmentServerQuery` joins only the columns the request's sort or filter
 * names, so unused custom columns cost nothing.
 */
const customColumnsAugmentor: QueryAugmentor = (ctx: QueryAugmentorContext) => {
  const defs = readCustomColumnDefs(ctx.config.customColumns);
  // The same join a live collection's family renders for the column — one
  // alias per column id, keyed to the surface (see `./scoped-columns`).
  const family = customScopedColumns.unwatchedFamily(ctx.dataViewId);
  const offered: Record<string, AugmentedColumn> = {};
  for (const def of defs) {
    const join = familyMember(family, def.id);
    const t = alias(_dataViewCustomValues, join.alias);
    const read = resolveFieldValueTextCast(def.type);
    offered[def.id] = {
      join,
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
