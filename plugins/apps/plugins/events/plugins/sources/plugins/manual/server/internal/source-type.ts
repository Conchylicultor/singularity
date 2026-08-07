import { defineEventSourceType } from "@plugins/apps/plugins/events/plugins/events-core/server";
import {
  MANUAL_SOURCE_TYPE_ID,
  manualSourceConfigFields,
  type ManualSourceConfig,
} from "../../core";
import { echoRows } from "./echo";
import { loadLiveEvents } from "./live-events";

/**
 * The cache key a manual source reports, forever.
 *
 * ## Why a constant and not `null`
 *
 * A fingerprint is a cache key over the **upstream material**. A manual source
 * has no upstream: its material is the `events` table itself, which is also the
 * refresh engine's destination. There is consequently nothing a refresh could
 * ever import, and a value that never moves is the literal truth about that —
 * after the first run, `fingerprint === lastFingerprint` and the engine reports
 * `unchanged` without reaching `extract` at all. A manual source becomes inert
 * with respect to refresh, which is exactly what it should be.
 *
 * `null` is the opposite declaration — "I cannot fingerprint cheaply, always
 * extract" — and choosing it here would be actively unsafe. It would put the
 * disappearance path one bug away on **every single run, forever**: any future
 * change that made the echo return a partial set (a `LIMIT`, a filter, a failed
 * read swallowed upstream) would bury the user's hand-typed list. The constant
 * reduces that reachable window to exactly one run, ever, per source.
 *
 * Versioned so a future change to the echo can force one re-run by bumping it —
 * the value is opaque to the engine, which only ever compares it for equality.
 */
const MANUAL_FINGERPRINT = "manual:v1";

/**
 * The hand-entry source type: **the user is the extractor.**
 *
 * ## How a manual source cannot lose the events the user typed
 *
 * The engine's contract is "`extract` returns the full current set, and every
 * identity absent from it gets `disappearedAt` stamped". A manual type that
 * naively returned `[]` would therefore bury the user's entire list on its first
 * refresh — `markEventsDisappeared` reads an empty seen-set as a source that
 * successfully listed nothing. Two belts, in order of when they act:
 *
 * 1. **`extract` vouches instead of importing.** It returns the source's own
 *    live rows, identity included (`./echo.ts`), so the seen-set is by
 *    construction a superset of everything still live and the disappearance
 *    predicate spares all of it. The upsert that follows is a value-for-value
 *    no-op, proven lossless at compile time by `EchoIsLossless`.
 * 2. **The constant fingerprint makes `extract` unreachable** after the first
 *    run of a given source, so belt 1 has to hold exactly once rather than on
 *    every tick.
 *
 * Belt 2 alone is not enough: a source's first refresh runs with
 * `lastFingerprint = null`, and a user who adds events by hand *before* clicking
 * "Refresh now" would lose them all. Belt 1 alone is not enough either — it
 * would be re-proved on every run of every manual source for the life of the
 * app. Neither is redundant; they cover different runs.
 *
 * ## Why not "don't participate in refresh at all"
 *
 * Because the contract has no way to say it. `EventSourceType` requires
 * `probe`/`extract`, and refusing (throwing) would park a source the user did
 * nothing wrong with in `status: "error"` — a false alarm is worse than a cheap
 * no-op. The honest fix is a contract addition in `events-core`; see this
 * plugin's `CLAUDE.md`. Until then this is the safe expression of "inert" within
 * the contract as frozen.
 */
export const manualSourceType = defineEventSourceType<ManualSourceConfig, null>({
  id: MANUAL_SOURCE_TYPE_ID,
  // The SAME record the web renders the (empty) form from — `validateConfig`
  // reads it off the registry, so a second literal here would be a second
  // schema, silently diverging from the one the user's form was built against.
  configFields: manualSourceConfigFields,

  /**
   * No I/O of any kind — not even a row count. The material this source type
   * reads is the destination table, so there is nothing to fetch and nothing
   * whose change could mean "re-import". Cheap enough that a manual source left
   * on a daily cadence costs one `unchanged` ledger row a day and no reads.
   */
  probe() {
    return Promise.resolve({ fingerprint: MANUAL_FINGERPRINT, payload: null });
  },

  /**
   * Reachable only while `lastFingerprint` has not caught up — a source's first
   * run in practice, plus a run after a fingerprint bump or after every earlier
   * run failed (a failed run deliberately leaves the fingerprint untouched).
   * Hands back the rows the user authored, unchanged — a vouch, not an import.
   *
   * `flags` is always empty, and truthfully so: the channel reports schedules a
   * page stated that the `date` format could not hold, and here the format IS
   * how the user stated it. There is nothing that failed to survive the trip.
   */
  async extract(_payload, ctx) {
    return { events: echoRows(await loadLiveEvents(ctx.sourceId)), flags: [] };
  },
});
