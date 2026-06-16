import type { FilterFieldValue } from "@plugins/primitives/plugins/data-view/web";
import {
  addUnits,
  resolveAnchorDay,
  type DateAnchor,
  type DateUnit,
} from "./date-anchor";

const DAY_MS = 24 * 60 * 60 * 1000;

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
    const b = resolveAnchorDay(operand);
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
  /** Inclusive lower bound — anchor or legacy ISO string. */
  from?: DateAnchor | string;
  /** Inclusive upper bound (whole-day) — anchor or legacy ISO string. */
  to?: DateAnchor | string;
}

/** Keep rows whose day falls within [from, to] inclusive; open bounds allowed. */
export function isBetween(
  operand: unknown,
  fieldValue: FilterFieldValue,
): boolean {
  const range = (operand ?? {}) as DateRange;
  const from = resolveAnchorDay(range.from);
  const to = resolveAnchorDay(range.to);
  if (from === null && to === null) return true;
  const a = fieldDay(fieldValue);
  if (a === null) return false;
  if (from !== null && a < from) return false;
  // `to` is inclusive of the whole day.
  if (to !== null && a > to + DAY_MS - 1) return false;
  return true;
}

/** Operand for the relative-range (within) operators: a magnitude + unit. */
export interface RelativeRange {
  unit: DateUnit;
  amount: number;
}

const DEFAULT_RELATIVE_RANGE: RelativeRange = { unit: "week", amount: 1 };

/**
 * Resolve a within-operator operand to an inclusive `[lo, hi]` start-of-day
 * window around today, or `null` for a missing/invalid operand (incomplete
 * rule). `past` → [today − N, today]; `next` → [today, today + N].
 */
export function withinRange(
  operand: unknown,
  direction: "past" | "next",
  now: number = Date.now(),
): [number, number] | null {
  const raw = (operand ?? {}) as Partial<RelativeRange>;
  const amount = typeof raw.amount === "number" ? raw.amount : NaN;
  const unit = raw.unit ?? DEFAULT_RELATIVE_RANGE.unit;
  if (Number.isNaN(amount) || amount <= 0) return null;
  const today = startOfDay(now);
  const shifted = addUnits(today, unit, direction === "past" ? -amount : amount);
  return direction === "past" ? [shifted, today] : [today, shifted];
}

function within(
  operand: unknown,
  fieldValue: FilterFieldValue,
  direction: "past" | "next",
): boolean {
  const range = withinRange(operand, direction);
  if (range === null) return true; // incomplete rule → keep
  const a = fieldDay(fieldValue);
  if (a === null) return false;
  const [lo, hi] = range;
  // Upper bound inclusive of the whole day, mirroring `isBetween`.
  return a >= lo && a <= hi + DAY_MS - 1;
}

export function isWithinPast(
  operand: unknown,
  fieldValue: FilterFieldValue,
): boolean {
  return within(operand, fieldValue, "past");
}

export function isWithinNext(
  operand: unknown,
  fieldValue: FilterFieldValue,
): boolean {
  return within(operand, fieldValue, "next");
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
