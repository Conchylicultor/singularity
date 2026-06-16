import type {
  FieldDef,
  FilterFieldValue,
  FilterGroup,
  FilterNode,
  FilterOperatorSet,
} from "../../core";

/**
 * Project a field's filter value off a row: the multi-value `values` accessor
 * when present, else the scalar `value` accessor, else undefined.
 */
function projectFieldValue<TRow>(
  field: FieldDef<TRow>,
  row: TRow,
): FilterFieldValue {
  if (field.values) return field.values(row);
  if (field.value) return field.value(row);
  return undefined;
}

/**
 * Recursively evaluate a filter node against a row. Pure — `resolveOperatorSet`
 * is injected so this is testable without React.
 *
 * Rules that can't be resolved (missing field or operator) evaluate to `true`
 * (they don't filter the row out — an incomplete rule is a no-op). An empty
 * group is `true`. `and` → every child; `or` → some child.
 */
export function evaluateNode<TRow>(
  node: FilterNode,
  row: TRow,
  fields: FieldDef<TRow>[],
  resolveOperatorSet: (typeId: string) => FilterOperatorSet | undefined,
): boolean {
  if (node.kind === "group") {
    if (node.children.length === 0) return true;
    const evalChild = (child: FilterNode) =>
      evaluateNode(child, row, fields, resolveOperatorSet);
    return node.conjunction === "and"
      ? node.children.every(evalChild)
      : node.children.some(evalChild);
  }

  const field = fields.find((f) => f.id === node.fieldId);
  if (!field) return true;
  const opSet = resolveOperatorSet(field.type ?? "text");
  const op = opSet?.operators.find((o) => o.id === node.operatorId);
  if (!op) return true;
  return op.predicate(node.value, projectFieldValue(field, row));
}

/**
 * Filter rows through a filter group. A null group keeps every row.
 */
export function applyFilter<TRow>(
  rows: readonly TRow[],
  filter: FilterGroup | null,
  fields: FieldDef<TRow>[],
  resolveOperatorSet: (typeId: string) => FilterOperatorSet | undefined,
): readonly TRow[] {
  if (!filter) return rows;
  return rows.filter((row) =>
    evaluateNode(filter, row, fields, resolveOperatorSet),
  );
}
