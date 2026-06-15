import type { FilterPredicate } from "@plugins/primitives/plugins/data-view/web";

export interface BoolFilterValue {
  want?: boolean;
}

function asValue(filterValue: unknown): BoolFilterValue {
  return (filterValue ?? {}) as BoolFilterValue;
}

/** Active when a specific truth value is requested. */
export function isActive(filterValue: unknown): boolean {
  return typeof asValue(filterValue).want === "boolean";
}

/** Keep rows whose boolean projection matches the requested value. */
export const predicate: FilterPredicate = (filterValue, fieldValue) => {
  const { want } = asValue(filterValue);
  if (typeof want !== "boolean") return true;
  return Boolean(fieldValue) === want;
};
