import { count, max } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { windowQueryResource } from "@plugins/infra/plugins/query-resource/server";
import {
  eventSourcesResource as eventSourcesDescriptor,
  eventsRevisionResource as eventsRevisionDescriptor,
} from "../../core";
import { _eventSources, _events } from "./tables";

// The compiled bounded window over `event_sources` (newest first). Every column
// is on the wire — a source row is small and the whole thing is what the sources
// pane renders — so no explicit `select`. `createdAt` is immutable, so a status /
// fingerprint / watermark write is an in-place upsert with no ids query; only an
// insert or delete re-derives membership.
export const eventSourcesServerResource = windowQueryResource(
  eventSourcesDescriptor,
  {
    from: _eventSources,
    orderBy: { col: _eventSources.createdAt, dir: "desc" },
    window: { maxLimit: 500 },
  },
);

// The live invalidation tick for the events DataView. A coarse revision over
// `events` — row count + max(updatedAt) as epoch-millis — hashed to a scalar
// string. On any events write the change-feed recomputes it; `mode: "push"`
// suppresses byte-identical payloads, so it only pulses on a genuine change.
//
// Every write to `events` MUST set `updatedAt` (the engine's upsert and the
// `disappearedAt` sweep alike) or the tick will not move.
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
      return { rev: `${total}:${maxUpdatedMs}` };
    },
  },
);
