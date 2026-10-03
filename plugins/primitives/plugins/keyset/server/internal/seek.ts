import { and, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import type { KeysetSortRule } from "@plugins/primitives/plugins/keyset/core";

/** A physical column, or a SQL expression standing in for one (a cast, a computed
 *  projection). Everything here only interpolates it into a `sql` template, so the
 *  two are interchangeable. */
export type ColumnExpr = AnyColumn | SQL;

/**
 * Binds one keyset-orderable field to its column. `nullable` drives the
 * null-aware seek terms (default `false`). Consumers that also compile filters
 * extend this with their own filter domain — the keyset seek reads only
 * `col` + `nullable`.
 */
export interface KeysetColumnBinding {
  col: ColumnExpr;
  nullable?: boolean;
}

/** fieldId → column binding. Unmapped sort fields are silently dropped (fail-soft). */
export type KeysetColumnMap = Record<string, KeysetColumnBinding>;

/**
 * One resolved ORDER BY / keyset key. `fieldId` is carried so the caller can
 * extract the matching value from a result row (see `keyValuesOf`) without
 * re-deriving the drop logic that `buildSortKeys` applied.
 */
export interface SortKey {
  fieldId: string;
  col: ColumnExpr;
  dir: "asc" | "desc";
  nullable: boolean;
}

/**
 * A non-null, totally-ordered tiebreaker column (the primary key) plus the
 * fieldId under which its value appears on a result row.
 */
export interface Tiebreaker {
  col: ColumnExpr;
  fieldId: string;
}

/**
 * Resolve `KeysetSortRule[]` → ordered `SortKey[]`, skipping unmapped fields, and
 * ALWAYS appending the PK `tiebreaker` (asc, non-null) as a final total-order
 * key so the keyset seek is strict (no dup/skip at page seams). If a sort rule
 * already targets the tiebreaker column, the redundant append is skipped (it
 * would otherwise risk a conflicting direction on the same column).
 */
export function buildSortKeys(
  sort: KeysetSortRule[],
  map: KeysetColumnMap,
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
 * Strict "before this value on `key`" term under NULLS LAST — the mirror of
 * {@link afterTerm}. A NULL cut value sits in the trailing NULL region, so every
 * non-null row precedes it (`col IS NOT NULL`); a non-null cut value is preceded
 * only by non-null values on the near side (a NULL comparison is not TRUE, so a
 * NULL row is correctly never "before" a value).
 */
function beforeTerm(key: SortKey, value: unknown): SQL {
  if (value == null) return sql`${key.col} IS NOT NULL`;
  return key.dir === "asc"
    ? sql`${key.col} < ${value}`
    : sql`${key.col} > ${value}`;
}

/**
 * Null-aware lexicographic "rows at or before the cut tuple" — the exact
 * complement of {@link seekPredicate} over the same keys, written as its own
 * positive predicate rather than `NOT seek`: a negated NULL comparison is NULL,
 * not TRUE, and would drop rows the order places before the cut.
 *
 *   OR_i [ eq(k_0)..eq(k_{i-1}) AND before(k_i) ]  OR  eq(k_0)..eq(k_n)
 *
 * The final all-equal branch keeps the cut row itself (the cut is inclusive).
 * The keys must end in a non-null total-order tiebreaker (the pk, as
 * `buildSortKeys` appends), so `seek(c)` and `atOrBefore(c)` split any row set
 * exactly in two, and each agrees with `ORDER BY … NULLS LAST`.
 *
 * Operands are interpolated as given: a caller whose cut values arrive as text
 * passes them pre-cast (`sql\`${v}::timestamptz\``), exactly as for the seek.
 */
export function atOrBeforePredicate(
  keys: SortKey[],
  cutValues: unknown[],
): SQL {
  if (cutValues.length !== keys.length) {
    throw new Error(
      `atOrBeforePredicate: the cut has ${cutValues.length} value(s) for ${keys.length} key(s) — a cut names every key, the tiebreaker included.`,
    );
  }
  const branches: SQL[] = [];
  for (let i = 0; i <= keys.length; i++) {
    const terms: SQL[] = [];
    for (let j = 0; j < i; j++) terms.push(eqTerm(keys[j]!, cutValues[j]));
    if (i < keys.length) terms.push(beforeTerm(keys[i]!, cutValues[i]));
    branches.push(terms.length === 1 ? terms[0]! : and(...terms)!);
  }
  return or(...branches)!;
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
