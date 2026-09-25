import {
  and,
  clause,
  type Filter,
} from "@plugins/network/plugins/live/plugins/filter/core";
import type { FilterLowerContext } from "@plugins/primitives/plugins/data-view/core";
import {
  addUnits,
  resolveAnchorDay,
  withinRange,
  type DateRange,
} from "../../core";

type Lower = (operand: unknown, ctx: FilterLowerContext) => Filter | undefined;

/** An epoch-ms instant as the language's instant operand (ISO-Z, ms). */
function iso(ms: number): string {
  return new Date(ms).toISOString();
}

/** The start of the (local) day after `day` — calendar-safe across DST. */
function nextDay(day: number): number {
  return addUnits(day, "day", 1);
}

/**
 * An anchor's (local) day start, reading the clock ONLY for a relative anchor
 * (`ctx.now` is read lazily, so an absolute date records no clock read).
 */
function anchorDay(operand: unknown, ctx: FilterLowerContext): number | null {
  return resolveAnchorDay(operand, () => ctx.now);
}

/** `[lo, hiExclusive)` as an instant range over `column`. */
function range(column: string, lo: number, hiExclusive: number): Filter {
  return and(
    clause(column, "gte", iso(lo)),
    clause(column, "lt", iso(hiExclusive)),
  );
}

/** A comparison against one anchor's day, lowered by `toFilter(dayStart)`. */
function onDay(toFilter: (column: string, day: number) => Filter): Lower {
  return (operand, ctx) => {
    const day = anchorDay(operand, ctx);
    return day === null ? undefined : toFilter(ctx.column, day);
  };
}

function within(direction: "past" | "next"): Lower {
  return (operand, ctx) => {
    const window = withinRange(operand, direction, () => ctx.now);
    if (window === null) return undefined;
    const [lo, hi] = window;
    // The upper day is inclusive, mirroring `is-between`.
    return range(ctx.column, lo, nextDay(hi));
  };
}

/**
 * The date operators lowered into the filter language's `instant` domain.
 * Day-granular: an anchor resolves (through the shared anchor math) to the start
 * of its local day, and each comparison becomes a half-open instant range —
 * `is` → [day, next day), `is before` → < day, `is after` → ≥ next day,
 * `on or before` → < next day, `on or after` → ≥ day. A relative anchor
 * ("Today", "within the past week") is resolved against `ctx.now` here, on the
 * client: the language itself has no clock.
 */
export const dateLower = {
  is: onDay((column, day) => range(column, day, nextDay(day))),
  "is-before": onDay((column, day) => clause(column, "lt", iso(day))),
  "is-after": onDay((column, day) => clause(column, "gte", iso(nextDay(day)))),
  "is-on-or-before": onDay((column, day) =>
    clause(column, "lt", iso(nextDay(day))),
  ),
  "is-on-or-after": onDay((column, day) => clause(column, "gte", iso(day))),
  "is-between": (operand, ctx) => {
    const bounds = (operand ?? {}) as DateRange;
    const from = anchorDay(bounds.from, ctx);
    const to = anchorDay(bounds.to, ctx);
    const parts: Filter[] = [];
    if (from !== null) parts.push(clause(ctx.column, "gte", iso(from)));
    // `to` is inclusive of the whole day.
    if (to !== null) parts.push(clause(ctx.column, "lt", iso(nextDay(to))));
    if (parts.length === 0) return undefined;
    return parts.length === 1 ? parts[0] : and(...parts);
  },
  "is-within-past": within("past"),
  "is-within-next": within("next"),
  "is-empty": (_operand, { column }) => clause(column, "isEmpty"),
  "is-not-empty": (_operand, { column }) => clause(column, "isNotEmpty"),
} satisfies Record<string, Lower>;
