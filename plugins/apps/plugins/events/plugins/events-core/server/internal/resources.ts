import { count, max } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { serveCollection } from "@plugins/network/plugins/live/server";
import {
  eventSources,
  eventRunsRevisionResource as eventRunsRevisionDescriptor,
} from "../../core";
import { _eventSources, _eventSourceRuns } from "./tables";

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

// The live invalidation tick for the run ledger.
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
