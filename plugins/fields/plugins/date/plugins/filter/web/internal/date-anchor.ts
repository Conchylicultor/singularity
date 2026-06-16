/**
 * Date-anchor operand model — the JSON-serializable shape stored in
 * `FilterRule.value` for date operators, plus the pure resolver that turns it
 * into a start-of-(local)-day epoch ms against an injectable `now`.
 *
 * Backward compat: a legacy operand is a bare ISO `yyyy-mm-dd` string and keeps
 * resolving as an absolute date.
 */

export type DateUnit = "day" | "week" | "month" | "year";

/** Discriminated anchor union. `amount` is signed: <0 = ago, >0 = from now. */
export type DateAnchor =
  | { kind: "date"; iso: string }
  | { kind: "relative"; unit: DateUnit; amount: number };

/** The canonical "Today" anchor. */
export const TODAY: DateAnchor = { kind: "relative", unit: "day", amount: 0 };

/** Truncate an epoch ms timestamp to the start of its (local) day. */
function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Calendar-safe shift using Date setters so month/year arithmetic and DST stay
 * correct (`setMonth`/`setFullYear` roll over month length; `setDate` handles
 * DST). Returns the start-of-day epoch ms of the shifted date.
 */
export function addUnits(t: number, unit: DateUnit, amount: number): number {
  const d = new Date(startOfDay(t));
  switch (unit) {
    case "day":
      d.setDate(d.getDate() + amount);
      break;
    case "week":
      d.setDate(d.getDate() + amount * 7);
      break;
    case "month":
      d.setMonth(d.getMonth() + amount);
      break;
    case "year":
      d.setFullYear(d.getFullYear() + amount);
      break;
  }
  return startOfDay(d.getTime());
}

function isRelative(
  operand: unknown,
): operand is { kind: "relative"; unit: DateUnit; amount: number } {
  return (
    typeof operand === "object" &&
    operand !== null &&
    (operand as { kind?: unknown }).kind === "relative"
  );
}

function isDateAnchor(
  operand: unknown,
): operand is { kind: "date"; iso: string } {
  return (
    typeof operand === "object" &&
    operand !== null &&
    (operand as { kind?: unknown }).kind === "date"
  );
}

/**
 * Resolve an anchor (or a legacy bare ISO string) to a start-of-(local)-day
 * epoch ms, or `null` for an empty/invalid operand (an incomplete rule).
 */
export function resolveAnchorDay(
  operand: unknown,
  now: number = Date.now(),
): number | null {
  if (operand === null || operand === undefined || operand === "") return null;

  if (typeof operand === "string") {
    const t = new Date(operand).getTime();
    return Number.isNaN(t) ? null : startOfDay(t);
  }

  if (isDateAnchor(operand)) {
    if (typeof operand.iso !== "string" || operand.iso === "") return null;
    const t = new Date(operand.iso).getTime();
    return Number.isNaN(t) ? null : startOfDay(t);
  }

  if (isRelative(operand)) {
    if (typeof operand.amount !== "number" || Number.isNaN(operand.amount)) {
      return null;
    }
    return addUnits(startOfDay(now), operand.unit, operand.amount);
  }

  return null;
}

const UNIT_LABEL: Record<DateUnit, string> = {
  day: "day",
  week: "week",
  month: "month",
  year: "year",
};

/**
 * Human label for an anchor:
 * - relative day 0/-1/+1 → "Today" / "Yesterday" / "Tomorrow"
 * - other relative → "3 days ago" / "2 weeks from now"
 * - absolute → locale short date, e.g. "Jan 15, 2026"
 * - empty → "" (caller shows a placeholder)
 */
export function formatAnchor(operand: unknown): string {
  if (operand === null || operand === undefined || operand === "") return "";

  if (isRelative(operand)) {
    const { unit, amount } = operand;
    if (unit === "day") {
      if (amount === 0) return "Today";
      if (amount === -1) return "Yesterday";
      if (amount === 1) return "Tomorrow";
    }
    const magnitude = Math.abs(amount);
    const noun = UNIT_LABEL[unit] + (magnitude === 1 ? "" : "s");
    const direction = amount < 0 ? "ago" : "from now";
    return `${magnitude} ${noun} ${direction}`;
  }

  const iso = isDateAnchor(operand)
    ? operand.iso
    : typeof operand === "string"
      ? operand
      : "";
  if (iso === "") return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  return new Date(t).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
