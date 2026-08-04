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
