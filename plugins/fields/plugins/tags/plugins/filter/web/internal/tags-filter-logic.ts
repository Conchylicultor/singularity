import type { FilterPredicate } from "@plugins/primitives/plugins/data-view/web";

export interface TagsFilterValue {
  selected?: string[];
}

function asValue(filterValue: unknown): TagsFilterValue {
  return (filterValue ?? {}) as TagsFilterValue;
}

/** Active when at least one tag is selected. */
export function isActive(filterValue: unknown): boolean {
  return (asValue(filterValue).selected?.length ?? 0) > 0;
}

/**
 * Keep rows whose tag set intersects the selected set (match-any). With no
 * selection the filter is inactive and keeps every row.
 */
export const predicate: FilterPredicate = (filterValue, fieldValue) => {
  const { selected } = asValue(filterValue);
  if (!selected || selected.length === 0) return true;
  const rowValues: readonly string[] = Array.isArray(fieldValue)
    ? fieldValue
    : [];
  return selected.some((s) => rowValues.includes(s));
};
