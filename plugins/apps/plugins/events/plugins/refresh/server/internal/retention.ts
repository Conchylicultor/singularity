import {
  defineRetention,
  markCascadeBounded,
} from "@plugins/infra/plugins/retention/server";
import {
  _eventSourceRuns,
  _eventSourceRunEvents,
  eventsTable,
} from "@plugins/apps/plugins/events/plugins/events-core/server";

// The growth bounds for the two tables this engine fills. They live here rather
// than in `events-core` because the engine owns the writes: a composition that
// installs the contracts without the engine writes nothing, and would schedule
// two sweeps over tables that never grow.
//
// Both are main-only (the `defineRetention` default). The canonical events DB is
// main's; a worktree fork is ephemeral and would spend its short life sweeping
// rows that vanish with it.

/**
 * Disappeared events are purged after 90 days.
 *
 * The predicate is `disappeared_at < cutoff`, and `disappeared_at` is NULL for
 * every live event — SQL comparisons against NULL are never true, so a currently
 * listed event is structurally out of reach of this sweep however old it is.
 * Ninety days is what makes soft-disappearance safe rather than a permanent
 * leak: a source that flickers (a page that 500s, a listing pulled and reposted)
 * gets its rows back via the next successful upsert, which un-disappears them.
 *
 * A DELETE needs no `updated_at` stamp to reach the live DataView — the
 * `events.revision` tick is `count(*) + max(updated_at)`, and removing rows moves
 * the count.
 */
export const eventsRetention = defineRetention({
  table: eventsTable,
  column: "disappearedAt",
  ttlDays: 90,
});

/**
 * The run ledger keeps 30 days. It is a firehose by design — every source, every
 * cadence tick, including the cheap `unchanged` runs — and its value is
 * answering "why did nothing happen *lately*", which a month covers.
 */
export const eventSourceRunsRetention = defineRetention({
  table: _eventSourceRuns,
  column: "startedAt",
  ttlDays: 30,
});

/**
 * The per-event detail of a run needs no sweep of its own: every row belongs to
 * exactly one run and dies with it under the 30-day sweep above. The FK to
 * `events` matters too (an event purged at 90 days takes its links), but the RUN
 * is the owner — it is what bounds the growth.
 *
 * `markCascadeBounded` reads the drizzle FK declaration at module eval and
 * throws (boot-fatal) if that `onDelete: "cascade"` is ever dropped, so the
 * bound is a checked fact rather than this comment.
 */
markCascadeBounded(_eventSourceRunEvents, _eventSourceRuns);
