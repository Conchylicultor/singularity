import type { FilterPredicate } from "@plugins/primitives/plugins/data-view/web";

export interface TextFilterValue {
  contains?: string;
}

function asValue(filterValue: unknown): TextFilterValue {
  return (filterValue ?? {}) as TextFilterValue;
}

/** True when a non-empty substring is set. */
export function isActive(filterValue: unknown): boolean {
  const { contains } = asValue(filterValue);
  return typeof contains === "string" && contains.trim() !== "";
}

/** Keep rows whose text value contains the query (case-insensitive). */
export const predicate: FilterPredicate = (filterValue, fieldValue) => {
  const { contains } = asValue(filterValue);
  if (!contains) return true;
  return String(fieldValue ?? "")
    .toLowerCase()
    .includes(contains.toLowerCase());
};
