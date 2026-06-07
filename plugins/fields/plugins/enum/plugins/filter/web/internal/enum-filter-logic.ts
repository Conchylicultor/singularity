import type { FieldValue } from "@plugins/primitives/plugins/data-view/web";

export interface EnumFilterValue {
  selected?: string[];
}

function asValue(filterValue: unknown): EnumFilterValue {
  return (filterValue ?? {}) as EnumFilterValue;
}

/** Active when at least one option is selected. */
export function isActive(filterValue: unknown): boolean {
  return (asValue(filterValue).selected?.length ?? 0) > 0;
}

/** Keep rows whose value is among the selected options. */
export function predicate(filterValue: unknown, fieldValue: FieldValue): boolean {
  const { selected } = asValue(filterValue);
  if (!selected || selected.length === 0) return true;
  return selected.includes(String(fieldValue ?? ""));
}
