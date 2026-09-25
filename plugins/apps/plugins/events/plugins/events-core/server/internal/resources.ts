import { count, eq, max, sql } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { serveCollection } from "@plugins/network/plugins/live/server";
import {
  eventSources,
  eventsRevisionResource as eventsRevisionDescriptor,
  eventRunsRevisionResource as eventRunsRevisionDescriptor,
} from "../../core";
import { _eventSources, _eventSourceRuns, _events } from "./tables";

// The sources collection over `event_sources`: its window (filterable on
// status / enabled, sortable by createdAt / name) and its `:rows` point sibling.
// Every column is on the wire — a source row is small and the whole thing is
// what the sources pane renders. `createdAt` never changes; `name` does, so a
// rename costs one bounded ids query per subscribed window (the order signature
// covers every sortable column), while a status / fingerprint / watermark write
// stays an in-place upsert.
export const eventSourcesServed = serveCollection(eventSources, {
  from: _eventSources,
});

// The live invalidation tick for the events DataView. It means "the events
// QUERY's result may have moved", which is NOT the same as "an events row
// changed" — the query hides events whose source is disabled unless the caller
// filters on `sourceId`, so its result has TWO inputs: the rows, and which
// sources are currently active. Both are folded into `rev`.
//
// The rows half is a coarse revision over `events` — row count + max(updatedAt)
// as epoch-millis. `updatedAt` is derived by a DB trigger (see `tables.ts`):
// every change to a counted — i.e. list-visible — column moves it, so no writer
// can forget to. The sighting stamps (`lastSeenAt` / `firstSeenAt`) deliberately
// do not count, so a content-identical re-extraction does not pulse open lists.
//
// The active-sources half digests the IDS of the enabled sources and NOTHING
// else — deliberately never `updated_at`. A run flips a source row's `status`
// running → idle (and the watermarks with it) several times per run, so folding
// the source's timestamp in would pulse every open events list on every refresh
// of every source, for a change the list cannot even see. Enabling or disabling
// a source moves the id set, which is exactly the change that alters what the
// query returns.
//
// The loader READING `event_sources` is what puts that table in this resource's
// read-set, which is what makes the change feed recompute it on a source write —
// `identityTable: "events"` decides how an `events` change is ROUTED (scoped),
// not which tables can trigger a recompute; a change on an uncovered read-set
// table recomputes the resource in full. `mode: "push"` then suppresses
// byte-identical payloads, so a recompute that finds nothing changed (the
// running/idle flips) costs the client nothing.
export const eventsRevisionServerResource = defineResource(
  eventsRevisionDescriptor,
  {
    mode: "push",
    identityTable: "events",
    debounceMs: 250,
    loader: async (): Promise<{ rev: string }> => {
      const [agg] = await db
        .select({ total: count(), maxUpdated: max(_events.updatedAt) })
        .from(_events);
      const total = agg?.total ?? 0;
      const maxUpdatedMs = agg?.maxUpdated
        ? new Date(agg.maxUpdated).getTime()
        : 0;
      // Order-independent by construction (`order by id`), and md5'd so the
      // payload stays one small scalar however many sources the user configures.
      // `coalesce(…, '')` is the no-enabled-sources case: `string_agg` over zero
      // rows is NULL, and a null `rev` would be a broken payload rather than the
      // legitimate "nothing is active" it actually means.
      const [sources] = await db
        .select({
          digest:
            sql`coalesce(md5(string_agg(${_eventSources.id}, ',' order by ${_eventSources.id})), '')`.mapWith(
              String,
            ),
        })
        .from(_eventSources)
        .where(eq(_eventSources.enabled, true));
      return { rev: `${total}:${maxUpdatedMs}:${sources?.digest ?? ""}` };
    },
  },
);

// The live invalidation tick for the run ledger, the same shape one table over.
// A run row is written once and never updated (`run-ledger.ts` inserts at the
// END of the run), so row count + the newest `startedAt` is the whole truth: an
// insert moves both, and the 30-day retention sweep moves the count.
//
// This is what makes a finished run appear without a page reload. It is NOT
// optional politeness: the ledger row and the source row's status are written in
// one transaction, and the status is already live — so a stale runs list
// contradicts the card above it.
export const eventRunsRevisionServerResource = defineResource(
  eventRunsRevisionDescriptor,
  {
    mode: "push",
    identityTable: "event_source_runs",
    debounceMs: 250,
    loader: async (): Promise<{ rev: string }> => {
      const [agg] = await db
        .select({ total: count(), maxStarted: max(_eventSourceRuns.startedAt) })
        .from(_eventSourceRuns);
      const total = agg?.total ?? 0;
      const maxStartedMs = agg?.maxStarted
        ? new Date(agg.maxStarted).getTime()
        : 0;
      return { rev: `${total}:${maxStartedMs}` };
    },
  },
);
