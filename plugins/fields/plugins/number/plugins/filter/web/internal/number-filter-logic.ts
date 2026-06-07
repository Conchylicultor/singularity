import type { FieldValue } from "@plugins/primitives/plugins/data-view/web";

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
export function predicate(filterValue: unknown, fieldValue: FieldValue): boolean {
  const { min, max } = asRange(filterValue);
  if (typeof fieldValue !== "number") return false;
  if (typeof min === "number" && fieldValue < min) return false;
  if (typeof max === "number" && fieldValue > max) return false;
  return true;
}
