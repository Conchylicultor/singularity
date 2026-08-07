import {
  type EventDate,
  type RecurrenceRule,
  ruleInterval,
  type Weekday,
} from "./event-date";

// The human reading of the format, and the projection onto the denormalized
// `events` columns.
//
// Both live here because they are the same act: `recurrenceLabel` is a label,
// and the ONLY thing that stops it drifting from `date` is that one function
// derives it. The engine writes `startsAt` / `endsAt` / `allDay` / `recurring` /
// `recurrenceLabel` from `eventDateProjection` and nowhere else, so the columns
// the event list reads cannot disagree with the rule the row carries.

const WEEKDAY_NAME: Record<Weekday, string> = {
  mo: "Monday",
  tu: "Tuesday",
  we: "Wednesday",
  th: "Thursday",
  fr: "Friday",
  sa: "Saturday",
  su: "Sunday",
};

const SHORT_MONTH = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const LONG_MONTH = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/**
 * "every Thursday", "first Friday of the month" — the sentence to show when the
 * page supplied no words of its own.
 *
 * Formatted from fixed English names and UTC parts rather than `Intl`: this
 * string is stored on the row, so it must not change with the locale or zone of
 * whichever process happened to write it.
 */
export function describeEventDate(date: EventDate): string {
  if (date.kind === "once") return `on ${formatUtcDay(date.startsAt)}`;
  return `${describeRule(date.rule, date.startsAt)}${describeEnd(date.rule)}`;
}

export interface EventDateProjection {
  startsAt: Date;
  endsAt: Date | null;
  allDay: boolean;
  recurring: boolean;
  recurrenceLabel: string | null;
}

/**
 * The denormalized `events` columns, derived from the format in ONE place.
 *
 * `recurrenceLabel` prefers the page's own words and falls back to our sentence;
 * a blank label is treated as absent, because a model emitting `""` means "I
 * have none" and honouring it literally would blank the column for a series that
 * plainly has a schedule.
 *
 * A `once` date gets `null`: it has no series meaning, and a label there would
 * read as a recurrence in every surface that shows the column.
 */
export function eventDateProjection(date: EventDate): EventDateProjection {
  const base = {
    startsAt: date.startsAt,
    endsAt: date.endsAt ?? null,
    allDay: date.allDay ?? false,
  };
  if (date.kind === "once") {
    return { ...base, recurring: false, recurrenceLabel: null };
  }
  const supplied = date.label?.trim();
  return {
    ...base,
    recurring: true,
    recurrenceLabel: supplied ? supplied : describeEventDate(date),
  };
}

/* ------------------------------------------------------------------ */

function describeRule(rule: RecurrenceRule, anchor: Date): string {
  const n = ruleInterval(rule);
  switch (rule.freq) {
    case "daily": {
      const base = n === 1 ? "every day" : `every ${n} days`;
      return rule.byWeekday?.length
        ? `${base} on ${weekdayList(rule.byWeekday)}`
        : base;
    }
    case "weekly": {
      if (rule.byWeekday?.length) {
        const list = weekdayList(rule.byWeekday);
        return n === 1 ? `every ${list}` : `every ${n} weeks on ${list}`;
      }
      return n === 1 ? "every week" : `every ${n} weeks`;
    }
    case "monthly": {
      if (rule.nthWeekday) {
        const position = `${nthLabel(rule.nthWeekday.nth)} ${WEEKDAY_NAME[rule.nthWeekday.weekday]}`;
        return n === 1
          ? `${position} of the month`
          : `${position} every ${n} months`;
      }
      if (rule.byMonthDay?.length) {
        const list = joinList(uniqueSorted(rule.byMonthDay).map(ordinal));
        return n === 1
          ? `on the ${list} of the month`
          : `on the ${list} every ${n} months`;
      }
      if (rule.byWeekday?.length) {
        const list = weekdayList(rule.byWeekday);
        return n === 1
          ? `every ${list} of the month`
          : `every ${list}, every ${n} months`;
      }
      return n === 1 ? "every month" : `every ${n} months`;
    }
    case "yearly": {
      const month = LONG_MONTH[anchor.getUTCMonth()] ?? "";
      if (rule.nthWeekday) {
        const position = `${nthLabel(rule.nthWeekday.nth)} ${WEEKDAY_NAME[rule.nthWeekday.weekday]}`;
        return n === 1
          ? `${position} of ${month}, every year`
          : `${position} of ${month}, every ${n} years`;
      }
      const base = n === 1 ? "every year" : `every ${n} years`;
      return `${base} in ${month}`;
    }
  }
}

/** Both endings can coexist ("until X, 6 times"); whichever fires first wins in the expander. */
function describeEnd(rule: RecurrenceRule): string {
  let out = "";
  if (rule.until) out += `, until ${formatUtcDay(rule.until)}`;
  if (rule.count !== undefined) out += `, ${rule.count} times`;
  return out;
}

function weekdayList(days: readonly Weekday[]): string {
  return joinList([...new Set(days)].map((day) => WEEKDAY_NAME[day]));
}

function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function nthLabel(nth: number): string {
  if (nth === -1) return "last";
  return { 1: "first", 2: "second", 3: "third", 4: "fourth", 5: "fifth" }[
    nth
  ] ?? ordinal(nth);
}

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** `13 Aug 2026`, UTC — the same string on every machine. */
function formatUtcDay(instant: Date): string {
  const day = instant.getUTCDate();
  const month = SHORT_MONTH[instant.getUTCMonth()] ?? "";
  return `${day} ${month} ${instant.getUTCFullYear()}`;
}

function uniqueSorted(values: readonly number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}
