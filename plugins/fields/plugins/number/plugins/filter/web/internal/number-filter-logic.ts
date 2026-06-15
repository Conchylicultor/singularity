import type { FilterPredicate } from "@plugins/primitives/plugins/data-view/web";

export interface NumberFilterValue {
  min?: number;
  max?: number;
}

function asRange(filterValue: unknown): NumberFilterValue {
  return (filterValue ?? {}) as NumberFilterValue;
}

/** True when at least one bound is set. */
export function isActive(filterValue: unknown): boolean {
  const { min, max } = asRange(filterValue);
  return typeof min === "number" || typeof max === "number";
}

/** Keep rows whose numeric value falls within the [min, max] bounds. */
export const predicate: FilterPredicate = (filterValue, fieldValue) => {
  const { min, max } = asRange(filterValue);
  if (typeof fieldValue !== "number") return false;
  if (typeof min === "number" && fieldValue < min) return false;
  if (typeof max === "number" && fieldValue > max) return false;
  return true;
};
