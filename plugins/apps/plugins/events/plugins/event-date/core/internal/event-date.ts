import { z } from "zod";

// The format itself: what an extractor says about WHEN an event happens.
//
// Two arms, on purpose. A recurring event is ONE row carrying a rule, never N
// materialized occurrences — materialization is what made the model emit nine
// near-identical objects for "every Thursday", let them drift from each other,
// and left the format with no vocabulary for the word "weekly".
//
// There is deliberately NO third arm for an irregular published date list
// ("Aug 13, Aug 20, Sep 3"). That case is precisely what the extraction flag
// channel exists to report: a closed rule vocabulary plus a channel for what it
// cannot hold beats an open-ended shape that silently approximates.

/** Monday-first, because every weekday index in this plugin is an index into THIS array. */
export const WEEKDAYS = ["mo", "tu", "we", "th", "fr", "sa", "su"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const RECURRENCE_FREQS = [
  "daily",
  "weekly",
  "monthly",
  "yearly",
] as const;
export type RecurrenceFreq = (typeof RECURRENCE_FREQS)[number];

/**
 * The rule half of a recurring date — rich enough for what venue pages actually
 * publish, closed enough that every value has exactly one meaning.
 *
 * `interval` is `.optional()` and NOT `.default(1)`, which would read better
 * here: this schema is also an `events.date` field schema, and `FieldDef.schema`
 * is `z.ZodType<T>` — input === output — so any inner `.default()` makes it
 * unusable as one (see the note on `FieldDef.schema` in `fields/core`). Every
 * read of the value inside this plugin goes through {@link ruleInterval}, and
 * nothing outside this plugin reads it, so the absent case is normalized in one
 * place rather than at each call site.
 */
export const RecurrenceRuleSchema = z.object({
  freq: z.enum(RECURRENCE_FREQS),
  interval: z.number().int().positive().optional(),
  byWeekday: z.array(z.enum(WEEKDAYS)).optional(),
  byMonthDay: z.array(z.number().int().min(1).max(31)).optional(),
  nthWeekday: z
    .object({
      nth: z.number().int().min(-1).max(5),
      weekday: z.enum(WEEKDAYS),
    })
    .optional(),
  until: z.coerce.date().optional(),
  count: z.number().int().positive().optional(),
});

export type RecurrenceRule = z.infer<typeof RecurrenceRuleSchema>;

/**
 * The rule's step, with the absent case normalized — "every week" and "every 1
 * week" are the same rule and must never behave, describe, or IDENTIFY
 * differently.
 *
 * Plugin-internal on purpose: it is the single reader of `rule.interval`, which
 * is what keeps `undefined` from becoming a footgun each consumer has to
 * remember. Always a positive integer, so the expansion loop always advances.
 */
export function ruleInterval(rule: RecurrenceRule): number {
  return rule.interval ?? 1;
}

export const EventDateSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("once"),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date().optional(),
    allDay: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("recurring"),
    /** The anchor: the first (or next) occurrence, and the series' time of day. */
    startsAt: z.coerce.date(),
    /** End of THAT occurrence — it is what carries the duration to every other one. */
    endsAt: z.coerce.date().optional(),
    allDay: z.boolean().optional(),
    rule: RecurrenceRuleSchema,
    /** The page's own words for the series ("every Thursday"), when it has any. */
    label: z.string().optional(),
  }),
]);

export type EventDate = z.infer<typeof EventDateSchema>;

/** Internal narrowings — the barrel exports only `EventDate`, narrowed by `kind`. */
export type OnceEventDate = Extract<EventDate, { kind: "once" }>;
export type RecurringEventDate = Extract<EventDate, { kind: "recurring" }>;

/**
 * One concrete instant the format resolves to.
 *
 * `endsAt` is `null`, never absent: an occurrence with no stated end is a real
 * answer, and an optional key would let a consumer read "not computed yet" into
 * it.
 */
export interface EventOccurrence {
  startsAt: Date;
  endsAt: Date | null;
  allDay: boolean;
}

/** 0 = Monday … 6 = Sunday, matching `WEEKDAYS`. */
export function weekdayIndex(day: Weekday): number {
  return WEEKDAYS.indexOf(day);
}
