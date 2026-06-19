import type { FieldDef, FieldValue, SortRule } from "../../core";

/** Coerce a FieldValue to a comparable number|string (Date→ms, bool→0/1, …). */
export function comparable(value: FieldValue): number | string {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "boolean") return Number(value);
  if (typeof value === "number") return value;
  return String(value ?? "");
}

export function compareScalar(a: number | string, b: number | string): number {
  return typeof a === "number" && typeof b === "number"
    ? a - b
    : String(a).localeCompare(String(b));
}

/**
 * Build a stable multi-level comparator from the rule list. Resolves each rule to
 * its field's `value` projection ONCE (outside the hot compare loop), dropping
 * rules whose field is missing or has no `value`. Returns `null` when no rule
 * resolves (caller skips sorting → preserves source order).
 *
 * Stability: relies on `Array.prototype.sort` being stable (guaranteed in modern
 * V8/Bun) so a full tie (every rule compares equal) preserves the incoming source
 * order — the implicit final tie-break.
 */
export function makeSortComparator<TRow>(
  rules: SortRule[],
  fields: FieldDef<TRow>[],
): ((a: TRow, b: TRow) => number) | null {
  const resolved = rules
    .map((rule) => {
      const field = fields.find((f) => f.id === rule.fieldId);
      return field?.value ? { value: field.value, dir: rule.direction } : null;
    })
    .filter(
      (r): r is { value: (row: TRow) => FieldValue; dir: "asc" | "desc" } =>
        r !== null,
    );
  if (resolved.length === 0) return null;
  return (a, b) => {
    for (const { value, dir } of resolved) {
      const cmp = compareScalar(comparable(value(a)), comparable(value(b)));
      if (cmp !== 0) return dir === "desc" ? -cmp : cmp;
    }
    return 0; // full tie → Array.sort stability preserves source/rank order
  };
}
