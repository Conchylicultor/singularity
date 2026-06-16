import type { FilterFieldValue } from "@plugins/primitives/plugins/data-view/web";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Parse an ISO yyyy-mm-dd operand to its start-of-day epoch ms, or null. */
function operandDay(operand: unknown): number | null {
  if (typeof operand !== "string" || operand === "") return null;
  const t = new Date(operand).getTime();
  if (Number.isNaN(t)) return null;
  return startOfDay(t);
}

/** Project the row's date value to its start-of-day epoch ms, or null. */
function fieldDay(fieldValue: FilterFieldValue): number | null {
  let t: number | null = null;
  if (fieldValue instanceof Date) t = fieldValue.getTime();
  else if (typeof fieldValue === "number") t = fieldValue;
  else if (typeof fieldValue === "string" && fieldValue !== "") {
    const parsed = new Date(fieldValue).getTime();
    t = Number.isNaN(parsed) ? null : parsed;
  }
  if (t === null || Number.isNaN(t)) return null;
  return startOfDay(t);
}

/** Truncate an epoch ms timestamp to the start of its (local) day. */
function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function isEmptyValue(fieldValue: FilterFieldValue): boolean {
  return fieldDay(fieldValue) === null;
}

/** Day-granular comparator factory: empty operand → keep (incomplete rule). */
function dayCmp(
  cmp: (a: number, b: number) => boolean,
): (operand: unknown, fieldValue: FilterFieldValue) => boolean {
  return (operand, fieldValue) => {
    const b = operandDay(operand);
    if (b === null) return true;
    const a = fieldDay(fieldValue);
    if (a === null) return false;
    return cmp(a, b);
  };
}

export const is = dayCmp((a, b) => a === b);
export const isBefore = dayCmp((a, b) => a < b);
export const isAfter = dayCmp((a, b) => a > b);
export const isOnOrBefore = dayCmp((a, b) => a <= b);
export const isOnOrAfter = dayCmp((a, b) => a >= b);

export interface DateRange {
  /** ISO yyyy-mm-dd inclusive lower bound. */
  from?: string;
  /** ISO yyyy-mm-dd inclusive upper bound. */
  to?: string;
}

/** Keep rows whose day falls within [from, to] inclusive; open bounds allowed. */
export function isBetween(
  operand: unknown,
  fieldValue: FilterFieldValue,
): boolean {
  const range = (operand ?? {}) as DateRange;
  const from = operandDay(range.from);
  const to = operandDay(range.to);
  if (from === null && to === null) return true;
  const a = fieldDay(fieldValue);
  if (a === null) return false;
  if (from !== null && a < from) return false;
  // `to` is inclusive of the whole day.
  if (to !== null && a > to + DAY_MS - 1) return false;
  return true;
}

export function isEmpty(
  _operand: unknown,
  fieldValue: FilterFieldValue,
): boolean {
  return isEmptyValue(fieldValue);
}

export function isNotEmpty(
  _operand: unknown,
  fieldValue: FilterFieldValue,
): boolean {
  return !isEmptyValue(fieldValue);
}
