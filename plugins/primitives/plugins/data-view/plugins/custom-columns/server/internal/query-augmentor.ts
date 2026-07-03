import { and, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  DataViewServer,
  type QueryAugmentor,
  type QueryAugmentorContext,
  type ServerQueryAugmentation,
  type FieldColumnMap,
} from "@plugins/primitives/plugins/data-view/plugins/server-query/server";
import type {
  SortRule,
  FilterGroup,
  FilterNode,
} from "@plugins/primitives/plugins/data-view/core";
import { readCustomColumnDefs } from "../../shared/read-custom-column-defs";
import { _dataViewCustomValues } from "./tables";

/** Every fieldId referenced by a sort rule ∪ every leaf `fieldId` in the filter tree. */
function referencedFieldIds(
  sort: SortRule[],
  filter: FilterGroup | null,
): Set<string> {
  const ids = new Set<string>();
  for (const rule of sort) ids.add(rule.fieldId);
  const walk = (node: FilterNode) => {
    if (node.kind === "group") {
      for (const child of node.children) walk(child);
    } else {
      ids.add(node.fieldId);
    }
  };
  if (filter) walk(filter);
  return ids;
}

/** `cc-…` ids carry a hyphen — sanitize to a SQL-safe alias name. */
function sanitizeAlias(id: string): string {
  return `dvcv_${id.replace(/[^a-zA-Z0-9]/g, "_")}`;
}

/**
 * Custom-columns' server field-extension augmentor. For each custom column the
 * active `sort`/`filter` references, `LEFT JOIN` the generic
 * `data_view_custom_values` side-table (aliased per column) on
 * `(dataViewId, columnId, rowKey = rowKeyCol::text)` and bind its `value` column
 * into the `FieldColumnMap` under the `cc-*` id — so the existing `server-query`
 * compiler sorts/filters/seeks it as a normal `nullable` column. Sort-key columns
 * are also projected so the keyset cursor can read them. Only referenced columns
 * are joined; unused custom columns cost nothing.
 */
const customColumnsAugmentor: QueryAugmentor = (ctx: QueryAugmentorContext) => {
  const defs = readCustomColumnDefs(ctx.config.customColumns);
  const referenced = referencedFieldIds(ctx.sort, ctx.filter);
  const sortIds = new Set(ctx.sort.map((r) => r.fieldId));

  const columnMap: FieldColumnMap = {};
  const joins: ServerQueryAugmentation["joins"] = [];
  const projection: ServerQueryAugmentation["projection"] = {};

  const usedAliases = new Set<string>();
  for (const def of defs) {
    if (!referenced.has(def.id)) continue;

    // Ensure a unique alias if two ids collapse to the same sanitized name.
    let name = sanitizeAlias(def.id);
    if (usedAliases.has(name)) {
      let i = 2;
      while (usedAliases.has(`${name}_${i}`)) i++;
      name = `${name}_${i}`;
    }
    usedAliases.add(name);

    const t = alias(_dataViewCustomValues, name);
    joins.push({
      apply: (q) =>
        q.leftJoin(
          t,
          and(
            eq(t.dataViewId, ctx.dataViewId),
            eq(t.columnId, def.id),
            eq(t.rowKey, sql`${ctx.rowKeyCol}::text`),
          ),
        ),
    });
    columnMap[def.id] = { col: t.value, type: def.type, nullable: true };
    if (sortIds.has(def.id)) projection[def.id] = t.value;
  }

  return { columnMap, joins, projection };
};

/** The self-registering contribution wired into the plugin's `contributions`. */
export const customColumnsQueryAugmentor = DataViewServer.QueryAugmentor({
  augment: customColumnsAugmentor,
});
