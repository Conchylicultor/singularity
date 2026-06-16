import * as chrono from "chrono-node";
import { formatMention } from "./format-date";

/** Default time-of-day (local) for reminders whose query specified no time. */
const DEFAULT_REMINDER_HOUR = 9;

// Words a date query can start with. Used to keep the menu open while the user is
// mid-typing a date phrase, and to close it for unrelated `@text` (so `@` is not
// hijacked for ordinary prose). Digits are also treated as a date start.
const KEYWORDS = [
  "today", "tonight", "tomorrow", "yesterday", "now",
  "next", "last", "this", "in", "on", "end",
  "mon", "tue", "wed", "thu", "fri", "sat", "sun",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
  "january", "february", "march", "april", "june", "july", "august",
  "september", "october", "november", "december",
];

export interface DateOption {
  kind: "date" | "reminder";
  /** The resolved instant to insert (reminder already gets its default time). */
  date: Date;
  label: string;
}

export interface MenuModel {
  /** Whether the typeahead menu should be shown for this query. */
  open: boolean;
  options: DateOption[];
  /** True when open with no resolved options yet ("keep typing a date…"). */
  hint: boolean;
}

function reminderDate(date: Date, hasTime: boolean): Date {
  if (hasTime) return date;
  const d = new Date(date);
  d.setHours(DEFAULT_REMINDER_HOUR, 0, 0, 0);
  return d;
}

function dateOnly(now: Date, addDays: number): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + addDays);
  d.setHours(12, 0, 0, 0);
  return d;
}

/**
 * Derive the typeahead menu for a query. Empty query → Today / Tomorrow quick
 * picks. A parseable query → a "date" row and a "reminder" row for the resolved
 * instant. An unparseable query that still looks like the start of a date →
 * stays open with a hint; anything else closes the menu.
 */
export function buildMenu(query: string, now: Date): MenuModel {
  const q = query.trim();

  if (!q) {
    return {
      open: true,
      hint: false,
      options: [
        { kind: "date", date: dateOnly(now, 0), label: "Today" },
        { kind: "date", date: dateOnly(now, 1), label: "Tomorrow" },
      ],
    };
  }

  const parsed = chrono.parse(q, now, { forwardDate: true })[0];
  if (parsed) {
    const date = parsed.start.date();
    const hasTime = parsed.start.isCertain("hour");
    const remind = reminderDate(date, hasTime);
    return {
      open: true,
      hint: false,
      options: [
        { kind: "date", date, label: formatMention(date, false) },
        { kind: "reminder", date: remind, label: `Remind me · ${formatMention(remind, true)}` },
      ],
    };
  }

  // No parse yet — keep the menu open only while the query could still grow into
  // a date, so ordinary `@word` prose dismisses it.
  const lower = q.toLowerCase();
  const looksLikeDate =
    /^\d/.test(lower) || KEYWORDS.some((k) => k.startsWith(lower) || lower.startsWith(`${k} `));
  return { open: looksLikeDate, hint: looksLikeDate, options: [] };
}
