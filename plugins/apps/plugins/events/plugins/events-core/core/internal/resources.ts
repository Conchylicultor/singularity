import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { windowQueryResourceDescriptor } from "@plugins/infra/plugins/query-resource/core";
import { EventSourceSchema, type EventSource } from "./schema";

/**
 * The configured sources, as a BOUNDED ordered window (newest first, default 100
 * / max 500) — the default contract for a new DB-backed collection resource
 * (`research/2026-07-18-global-bounded-working-set-resource-contract.md`). The
 * set is small in practice but user-grown, so it gets a real bound rather than
 * an unbounded `queryResource`.
 *
 * `createdAt` is the order column and is immutable, so a status/fingerprint write
 * stays on the zero-ids-query in-place path; only an insert/delete costs an
 * O(window) membership re-derive.
 */
export const eventSourcesResource = windowQueryResourceDescriptor<EventSource>(
  "events.sources",
  EventSourceSchema,
  "id",
  { defaultLimit: 100 },
);

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
