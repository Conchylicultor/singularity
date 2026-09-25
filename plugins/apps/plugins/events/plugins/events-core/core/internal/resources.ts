import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { liveCollection } from "@plugins/network/plugins/live/core";
import { EventSourceSchema } from "./schema";
import { SOURCE_STATUSES } from "./vocab";

/**
 * The configured sources, as a live collection: a bounded window (newest first
 * by default, 100 / max 500) plus its `:rows` point sibling for by-id reads.
 * The set is small in practice but user-grown, so it gets a real bound rather
 * than an unbounded read.
 *
 * Consumers may filter on `status` / `enabled` and sort by `createdAt` / `name`
 * (`useLive(eventSources, { … })`); one row by id is `useLiveRow` — which reads
 * the point sibling, so a source outside any window is still found.
 */
export const eventSources = liveCollection("events.sources", {
  row: EventSourceSchema,
  id: "id",
  filterable: { status: z.enum(SOURCE_STATUSES), enabled: z.boolean() },
  sortable: ["createdAt", "name"],
  default: { orderBy: [["createdAt", "desc"]], limit: 100 },
  maxLimit: 500,
});

/**
 * Scalar invalidation tick for the `events` table: a cheap `{ rev }` the server
 * pushes only when a real `events` write lands. Consumers (the events DataView)
 * keep it OUT of their query key and refetch the loaded window in place when
 * `rev` changes — a windowed, filterable, unbounded-in-principle collection is
 * served by a delegated query, not by shipping rows over live-state.
 */
export const eventsRevisionResource = resourceDescriptor<{ rev: string }>(
  "events.revision",
  z.object({ rev: z.string() }),
  { rev: "" },
);

/**
 * The same tick for the run ledger (`event_source_runs`). The runs list is a
 * plain endpoint read — a bounded, filterable list is a query, not something to
 * ship over live-state — and this is what keeps that read fresh: `useEventSourceRuns`
 * refetches in place when `rev` moves.
 *
 * Without it a finished run stayed invisible until the page was reloaded, even
 * though the source row beside it flipped `running` → `idle` live off the
 * `events.sources` window. The two are written in ONE transaction, so a ledger
 * that lags the status is always a lie.
 *
 * Whole-table rather than per-source, for the `deploy.runs-revision` reason: a
 * source-id param would buy nothing — the ledger only moves while a run is in
 * flight, and a run is dedup'd to one per source.
 */
export const eventRunsRevisionResource = resourceDescriptor<{ rev: string }>(
  "events.runs-revision",
  z.object({ rev: z.string() }),
  { rev: "" },
);
