import { and, or, sql, type SQL } from "drizzle-orm";
import type {
  FilterGroup,
  FilterNode,
} from "@plugins/primitives/plugins/data-view/core";
import type { KeysetColumnBinding } from "@plugins/primitives/plugins/keyset/server";

/**
 * Binds one filterable/sortable field to its column — a physical column, or a
 * SQL expression standing in for one (`ColumnExpr`, from the keyset binding).
 * `type` is the field-type id (e.g. `"text"`, `"enum"`, `"date"`, `"bool"`,
 * `"number"`) used to resolve an operator's SQL builder; `nullable` (also from
 * the keyset binding) drives null-aware keyset seek terms (default `false`).
 */
export interface ColumnBinding extends KeysetColumnBinding {
  type: string;
}

/** fieldId → column binding. Unmapped fields are silently dropped (fail-soft). */
export type FieldColumnMap = Record<string, ColumnBinding>;

/**
 * Builds the SQL fragment for one (field-type, operator) pair. Returns
 * `undefined` when the rule is *incomplete* (e.g. a value-taking operator with
 * no operand) — that fragment is dropped, never emitted, never a 400.
 *
 * `target` is the field's column as a plain SQL expression, never the column
 * object: a comparison operand is not a stored value, and a column is a drizzle
 * encoder that would run its WRITE-side schema over every bound operand (see
 * `comparisonTarget` below, and `fields/server-capabilities`' structurally
 * identical `FilterSqlBuilder`).
 */
export type OperatorSqlBuilder = (
  target: SQL,
  operand: unknown,
) => SQL | undefined;

/**
 * Injected resolver: `(typeId, operatorId) → builder | null`. Returns `null`
 * when the type/operator is unknown (rule dropped). The compiler is field-type
 * agnostic — the consumer supplies a resolver (e.g. backed by a `Fields.FilterSql`
 * registry); nothing here imports `fields`.
 */
export type OperatorSqlResolver = (
  typeId: string,
  operatorId: string,
) => OperatorSqlBuilder | null;

function compileNode(
  node: FilterNode,
  map: FieldColumnMap,
  resolve: OperatorSqlResolver,
): SQL | undefined {
  if (node.kind === "group") {
    const parts: SQL[] = [];
    for (const child of node.children) {
      const compiled = compileNode(child, map, resolve);
      if (compiled !== undefined) parts.push(compiled);
    }
    if (parts.length === 0) return undefined;
    if (parts.length === 1) return parts[0];
    return node.conjunction === "or" ? or(...parts) : and(...parts);
  }
  // Rule: drop fail-soft when the field is unmapped, the operator is unknown,
  // or the builder reports the rule incomplete.
  const binding = map[node.fieldId];
  if (!binding) return undefined;
  const builder = resolve(binding.type, node.operatorId);
  if (!builder) return undefined;
  return builder(comparisonTarget(binding), node.value);
}

/**
 * The field's column as a plain expression — what a builder compares an operand
 * against. A `SQL` chunk flattens inside a `sql` template before drizzle's
 * parenthesising `isSQLWrapper` branch is reached, so this renders TEXTUALLY
 * identically to interpolating the column itself: same qualified
 * `"table"."column"`, same `$n` placeholders, same params, same plan. Only the
 * param *encoder* differs — and that is the whole point, since an operand is not
 * a stored value (see `OperatorSqlBuilder`).
 */
function comparisonTarget(binding: ColumnBinding): SQL {
  return sql`${binding.col}`;
}

/**
 * Compile an AND/OR `FilterGroup` tree → a single SQL predicate, or `undefined`
 * when the tree is null / empty / fully dropped (the caller then omits the
 * `WHERE` fragment).
 */
export function compileWhere(
  node: FilterGroup | null,
  map: FieldColumnMap,
  resolve: OperatorSqlResolver,
): SQL | undefined {
  if (!node) return undefined;
  return compileNode(node, map, resolve);
}
