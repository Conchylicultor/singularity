import * as chrono from "chrono-node";
import {
  isSameDay,
  relativeDayLabel,
} from "@plugins/primitives/plugins/date-picker/core";
import { formatDay, formatMention } from "./format-date";

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

/**
 * The relative vocabulary the menu advertises, as a FILTERED list rather than an
 * empty-query special case: a preset survives while the query is still a prefix
 * of its label, so `@tod` keeps offering a pressable `Today` instead of dropping
 * into the dead "keep typing" state. Labels are the same words `relativeDayLabel`
 * produces, so a preset row and a parsed row can never disagree about a day.
 */
const PRESETS: { label: string; offsetDays: number }[] = [
  { label: "Today", offsetDays: 0 },
  { label: "Tomorrow", offsetDays: 1 },
  { label: "Yesterday", offsetDays: -1 },
];

export interface DateOption {
  kind: "date" | "reminder";
  /** The resolved instant to insert (reminder already gets its default time). */
  date: Date;
  label: string;
  /**
   * Trailing muted absolute date, so a relative label ("Today") never hides which
   * calendar day it means.
   */
  detail?: string;
}

export interface MenuModel {
  /** Whether the typeahead menu should be shown for this query. */
  open: boolean;
  options: DateOption[];
  /** True when open with no resolved options yet (the query only *looks* like a date). */
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

/** The preset rows still reachable from `query` (all of them while it is empty). */
function presetOptions(query: string, now: Date): DateOption[] {
  const lower = query.toLowerCase();
  return PRESETS.filter((p) => lower === "" || p.label.toLowerCase().startsWith(lower)).map(
    (p) => {
      const date = dateOnly(now, p.offsetDays);
      return { kind: "date" as const, date, label: p.label, detail: formatDay(date) };
    },
  );
}

/**
 * Derive the typeahead menu for a query. The relative presets (Today / Tomorrow /
 * Yesterday) stay reachable while the query is a prefix of one of them; a
 * parseable query additionally yields a "date" row and a "reminder" row for the
 * resolved instant, labelled relatively when the day has a relative name. An
 * unparseable query that resolves nothing but still looks like the start of a
 * date stays open with a hint; anything else closes the menu.
 *
 * Pure and cheap by contract — it runs twice per keystroke (once in the caret
 * hook's `isQueryValid` open-gate, once for render).
 */
export function buildMenu(query: string, now: Date): MenuModel {
  const q = query.trim();
  const presets = presetOptions(q, now);

  if (!q) return { open: true, hint: false, options: presets };

  const parsed = chrono.parse(q, now, { forwardDate: true })[0];
  if (parsed) {
    const date = parsed.start.date();
    const hasTime = parsed.start.isCertain("hour");
    const remind = reminderDate(date, hasTime);
    const day = formatDay(date);
    const relative = relativeDayLabel(date, now);
    return {
      open: true,
      hint: false,
      options: [
        // `detail` exists so a RELATIVE label never hides its day — an absolute
        // label already is the day, so it carries none (never the same string twice).
        {
          kind: "date",
          date,
          label: relative ?? day,
          detail: relative === null ? undefined : day,
        },
        { kind: "reminder", date: remind, label: `Remind me · ${formatMention(remind, true)}` },
        // A preset landing on the parsed day is the same offer twice (`@today`).
        ...presets.filter((p) => !isSameDay(p.date, date)),
      ],
    };
  }

  if (presets.length > 0) return { open: true, hint: false, options: presets };

  // Nothing resolved — keep the menu open only while the query could still grow
  // into a date, so ordinary `@word` prose dismisses it.
  const lower = q.toLowerCase();
  const looksLikeDate =
    /^\d/.test(lower) || KEYWORDS.some((k) => k.startsWith(lower) || lower.startsWith(`${k} `));
  return { open: looksLikeDate, hint: looksLikeDate, options: [] };
}
