import {
  resolveAnchor,
  type EventDate,
  type EventOccurrence,
} from "@plugins/apps/plugins/events/plugins/event-date/core";

/**
 * What a row's occurrence columns should become, given its `date` and the
 * instant to resolve from — the whole re-anchor DECISION, with no database in
 * sight (the `planEventWrites` precedent next door).
 *
 * Three arms, and none of them is a failure:
 *  - `move` — the series' next occurrence is later than the stored one;
 *  - `keep` — the stored occurrence is already the next one;
 *  - `over` — the series has no occurrence left (`until` passed, `count`
 *    spent), so the stored anchor stays as the honest record of its last one.
 *
 * A discriminated result rather than `EventOccurrence | null`, so "nothing to
 * do" and "this series has ended" cannot collapse into one absorbable value.
 *
 * `from` is a plain instant and this function has NO opinion about days or
 * timezones — the caller decides what "current" means and passes it in. That is
 * load-bearing: the sweep passes the start of the local DAY rather than the
 * wall-clock instant, because the filters this column feeds compare at day
 * granularity. Resolving from `now` instead would move an event that started
 * earlier TODAY on to its next occurrence, hiding a series from the very day it
 * is running on — which is the same class of bug as never moving it at all.
 */
export type ReanchorPlan =
  | { kind: "move"; occurrence: EventOccurrence }
  | { kind: "keep" }
  | { kind: "over" };

export function planReanchor(
  date: EventDate,
  storedStartsAt: Date,
  from: Date,
): ReanchorPlan {
  const resolved = resolveAnchor(date, from);
  if (!resolved.found) return { kind: "over" };
  const occurrence = resolved.occurrence;
  // Compare rather than assume a stale row can only move forward, so a repeat
  // pass writes nothing and cannot tick the live `events.revision` for nothing.
  return occurrence.startsAt.getTime() === storedStartsAt.getTime()
    ? { kind: "keep" }
    : { kind: "move", occurrence };
}
