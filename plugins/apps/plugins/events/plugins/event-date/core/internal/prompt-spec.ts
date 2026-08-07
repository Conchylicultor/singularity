import { RECURRENCE_FREQS, WEEKDAYS } from "./event-date";

// The prompt fragment that documents the format to the model.
//
// It lives beside the schema, the expander and the identity key on purpose:
// these four are one artefact. A prompt that describes a key the schema does not
// have costs a terminal extraction failure on a real page, and a schema key the
// prompt never mentions is a key no model will ever fill — both are drift, and
// both are invisible until a run fails. Keeping the sentence next to the thing it
// describes is what a self-contained format plugin buys.
//
// The closed vocabularies are INTERPOLATED, never retyped, so the model
// physically cannot be told about a weekday token or a frequency that
// `EventDateSchema` would then reject.

/**
 * The `date` object, as the extraction prompt states it. Consumers interpolate
 * it where they document their event keys (see `url-extract`'s `prompt.ts`).
 *
 * The last paragraph is the load-bearing one: it points the model at the
 * response's global `flags` array — owned by the extraction envelope, not by
 * this plugin — for anything this vocabulary cannot hold. Without it a page
 * saying "every 2nd and 4th Tuesday" gets silently rounded to "every Tuesday",
 * and nobody ever finds out.
 */
export const EVENT_DATE_PROMPT_SPEC = `The "date" object (required on every event) says WHEN the event happens — either once, or as a rule. A repeating event is ONE event with a rule, never one event per occurrence: do not repeat the same event with different dates.

"date".kind is either "once" or "recurring".

A one-off event:
  "date": { "kind": "once", "startsAt": "2026-08-13T20:00:00+02:00", "endsAt": "2026-08-13T23:00:00+02:00", "allDay": false }
- startsAt (required) — ISO 8601 with the page's timezone offset when a time of day is given, otherwise the plain date ("2026-08-13").
- endsAt — same format, only when the page states an end.
- allDay — true when the page gives no time of day.

A repeating event carries the SAME three keys, where startsAt/endsAt describe only the FIRST (or next) occurrence — they supply the time of day and the duration every occurrence inherits — plus a "rule", and a "label" when the page has its own words for the schedule:
  "date": { "kind": "recurring", "startsAt": "2026-08-13T23:00:00+02:00", "endsAt": "2026-08-14T05:00:00+02:00", "rule": { "freq": "weekly", "interval": 1, "byWeekday": ["th"] }, "label": "every Thursday" }

"rule" keys:
- freq (required) — EXACTLY ONE of: ${RECURRENCE_FREQS.join(", ")}.
- interval — how many freq units between occurrences. 1 (the default) means every one, 2 means every other. "every other Tuesday" is { "freq": "weekly", "interval": 2, "byWeekday": ["tu"] }.
- byWeekday — the days it falls on, from: ${WEEKDAYS.join(", ")}. "every Monday and Thursday" is { "freq": "weekly", "byWeekday": ["mo", "th"] }.
- byMonthDay — days of the month, 1 to 31. "the 1st and 15th of every month" is { "freq": "monthly", "byMonthDay": [1, 15] }.
- nthWeekday — the nth weekday of the month; nth is 1 to 5, or -1 for the last one. "first Friday of the month" is { "freq": "monthly", "nthWeekday": { "nth": 1, "weekday": "fr" } }; "last Sunday of the month" uses { "nth": -1, "weekday": "su" }.
- until — the ISO date the series stops on, when the page states an end date.
- count — the total number of occurrences, when the page states a number instead ("6 weeks only").

"label" — the page's own phrasing of the schedule ("every Thursday", "first Friday of the month"), verbatim. Omit it rather than inventing one; a sentence will be generated from the rule.

When a schedule CANNOT be stated exactly with these keys — "every 2nd and 4th Tuesday", an irregular published list of dates ("Aug 13, Aug 20, Sep 3"), "most weekends", "check back for dates" — do NOT approximate it into a rule that says something else, and do NOT fall back to emitting one event per date. Emit the event once, as "kind": "once", for the next occurrence you can determine exactly, and add ONE entry to the response's global "flags" array naming the event and the schedule you could not express (for example: "Techno Thursdays runs on the 2nd and 4th Tuesday of each month; only the next date is recorded."). Flags describe the whole page, never a single event, and they are not a substitute for omitting an event whose date you cannot determine at all — omit that one.`;
