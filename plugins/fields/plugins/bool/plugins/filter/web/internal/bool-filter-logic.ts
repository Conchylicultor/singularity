import type { FieldValue } from "@plugins/primitives/plugins/data-view/web";

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
export function predicate(filterValue: unknown, fieldValue: FieldValue): boolean {
  const { want } = asValue(filterValue);
  if (typeof want !== "boolean") return true;
  return Boolean(fieldValue) === want;
}
