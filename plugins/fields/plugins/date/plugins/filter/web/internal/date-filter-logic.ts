import type { FilterFieldValue } from "@plugins/primitives/plugins/data-view/web";

export interface DateFilterValue {
  /** ISO yyyy-mm-dd (inclusive lower bound). */
  from?: string;
  /** ISO yyyy-mm-dd (inclusive upper bound, end-of-day). */
  to?: string;
}

function asValue(filterValue: unknown): DateFilterValue {
  return (filterValue ?? {}) as DateFilterValue;
}

function toMs(value: FilterFieldValue): number | null {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" || typeof value === "number") {
    const t = new Date(value).getTime();
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

/** Active when either bound is set. */
export function isActive(filterValue: unknown): boolean {
  const { from, to } = asValue(filterValue);
  return Boolean(from) || Boolean(to);
}

/** Keep rows whose date falls within [from 00:00, to 23:59:59.999]. */
export function predicate(
  filterValue: unknown,
  fieldValue: FilterFieldValue,
): boolean {
  const { from, to } = asValue(filterValue);
  const t = toMs(fieldValue);
  if (t === null) return false;
  if (from) {
    const lo = new Date(from).getTime();
    if (!Number.isNaN(lo) && t < lo) return false;
  }
  if (to) {
    const hi = new Date(to).getTime() + 24 * 60 * 60 * 1000 - 1;
    if (!Number.isNaN(hi) && t > hi) return false;
  }
  return true;
}
