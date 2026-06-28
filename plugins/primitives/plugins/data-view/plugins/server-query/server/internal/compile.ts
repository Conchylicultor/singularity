import { and, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import type {
  FilterGroup,
  FilterNode,
  SortRule,
} from "@plugins/primitives/plugins/data-view/core";

/**
 * Binds one filterable/sortable field to its physical column. `type` is the
 * field-type id (e.g. `"text"`, `"enum"`, `"date"`, `"bool"`, `"number"`) used
 * to resolve an operator's SQL builder; `nullable` drives null-aware keyset
 * seek terms (default `false`).
 */
export interface ColumnBinding {
  col: AnyColumn;
  type: string;
  nullable?: boolean;
}

/** fieldId → column binding. Unmapped fields are silently dropped (fail-soft). */
export type FieldColumnMap = Record<string, ColumnBinding>;

/**
 * Builds the SQL fragment for one (field-type, operator) pair. Returns
 * `undefined` when the rule is *incomplete* (e.g. a value-taking operator with
 * no operand) — that fragment is dropped, never emitted, never a 400.
 */
export type OperatorSqlBuilder = (
  col: AnyColumn,
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
  return builder(binding.col, node.value);
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

/**
 * One resolved ORDER BY / keyset key. `fieldId` is carried so the caller can
 * extract the matching value from a result row (see `keyValuesOf`) without
 * re-deriving the drop logic that `buildSortKeys` applied.
 */
export interface SortKey {
  fieldId: string;
  col: AnyColumn;
  dir: "asc" | "desc";
  nullable: boolean;
}

/**
 * A non-null, totally-ordered tiebreaker column (the primary key) plus the
 * fieldId under which its value appears on a result row.
 */
export interface Tiebreaker {
  col: AnyColumn;
  fieldId: string;
}

/**
 * Resolve `SortRule[]` → ordered `SortKey[]`, skipping unmapped fields, and
 * ALWAYS appending the PK `tiebreaker` (asc, non-null) as a final total-order
 * key so the keyset seek is strict (no dup/skip at page seams). If a sort rule
 * already targets the tiebreaker column, the redundant append is skipped (it
 * would otherwise risk a conflicting direction on the same column).
 */
export function buildSortKeys(
  sort: SortRule[],
  map: FieldColumnMap,
  tiebreaker: Tiebreaker,
): SortKey[] {
  const keys: SortKey[] = [];
  for (const rule of sort) {
    const binding = map[rule.fieldId];
    if (!binding) continue;
    keys.push({
      fieldId: rule.fieldId,
      col: binding.col,
      dir: rule.direction,
      nullable: binding.nullable ?? false,
    });
  }
  if (!keys.some((k) => k.col === tiebreaker.col)) {
    keys.push({
      fieldId: tiebreaker.fieldId,
      col: tiebreaker.col,
      dir: "asc",
      nullable: false,
    });
  }
  return keys;
}

/**
 * ORDER BY clauses with EXPLICIT `NULLS LAST` on every key, so NULLs always sort
 * to the end regardless of asc/desc — keeping the seek terms symmetric across
 * directions.
 */
export function orderByClauses(keys: SortKey[]): SQL[] {
  return keys.map((k) =>
    k.dir === "asc"
      ? sql`${k.col} ASC NULLS LAST`
      : sql`${k.col} DESC NULLS LAST`,
  );
}

/** Equality term for the seek's prefix chain: null-aware. */
function eqTerm(key: SortKey, value: unknown): SQL {
  return value == null ? sql`${key.col} IS NULL` : sql`${key.col} = ${value}`;
}

/**
 * Strict "after this value on `key`" term under NULLS LAST.
 *
 * Because NULLs always sort LAST (both directions), a NULL row is "after" any
 * non-null cursor value in BOTH asc and desc — so a nullable column's
 * after-term includes `OR col IS NULL` symmetrically. When the cursor value is
 * itself NULL it sits in the trailing NULL region: nothing is strictly after it
 * on this key, so the branch is dropped (`undefined`) and the seek falls through
 * to the next key via the eq-chain (`col IS NULL`).
 */
function afterTerm(key: SortKey, value: unknown): SQL | undefined {
  if (value == null) return undefined;
  const cmp =
    key.dir === "asc" ? sql`${key.col} > ${value}` : sql`${key.col} < ${value}`;
  return key.nullable ? sql`(${cmp} OR ${key.col} IS NULL)` : cmp;
}

/**
 * Null-aware lexicographic keyset seek: "rows strictly after the cursor tuple".
 *
 *   OR_i [ eq(k_0)..eq(k_{i-1}) AND after(k_i) ]
 *
 * Returns `undefined` for a null cursor (the first page emits no seek). The
 * final tiebreaker key is a non-null asc PK, so its after-term is always
 * `pk > $v` and the OR is never empty — the seek stays strict (gap-free and
 * dup-free) even across the NULL boundary mid-scroll.
 */
export function seekPredicate(
  keys: SortKey[],
  cursorValues: unknown[] | null,
): SQL | undefined {
  if (cursorValues === null) return undefined;
  const branches: SQL[] = [];
  for (let i = 0; i < keys.length; i++) {
    const after = afterTerm(keys[i]!, cursorValues[i]);
    if (after === undefined) continue;
    const terms: SQL[] = [];
    for (let j = 0; j < i; j++) terms.push(eqTerm(keys[j]!, cursorValues[j]));
    terms.push(after);
    branches.push(terms.length === 1 ? terms[0]! : and(...terms)!);
  }
  if (branches.length === 0) return undefined;
  return branches.length === 1 ? branches[0] : or(...branches)!;
}

/**
 * Extract the cursor key tuple from a result row, in key order. Defaults to
 * reading `row[key.fieldId]` for each key; pass `fieldIdsInKeyOrder` to override
 * (e.g. when the projected row keys differ from the field ids).
 */
export function keyValuesOf(
  row: Record<string, unknown>,
  keys: SortKey[],
  fieldIdsInKeyOrder: string[] = keys.map((k) => k.fieldId),
): unknown[] {
  return keys.map((_, i) => row[fieldIdsInKeyOrder[i]!]);
}
