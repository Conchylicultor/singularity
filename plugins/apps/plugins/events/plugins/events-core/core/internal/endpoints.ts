import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { EventSourceRunSchema, EventSourceSchema } from "./schema";
import { REFRESH_CADENCES } from "./vocab";

// Source CRUD + the run ledger read. `events` rows themselves are NOT served
// here — they are a server-delegated DataView query owned by `event-list`.

export const CreateEventSourceBodySchema = z.object({
  /** Must name a registered `EventSourceType.id`; an unknown type is a 400. */
  type: z.string(),
  /** Defaulted server-side (from the config's URL host, else the type id). */
  name: z.string().optional(),
  /** Validated against the source type's own `configFields`. */
  config: z.record(z.string(), z.unknown()),
  refresh: z.enum(REFRESH_CADENCES).optional(),
  enabled: z.boolean().optional(),
});
export type CreateEventSourceBody = z.infer<typeof CreateEventSourceBodySchema>;

/**
 * The autosave PATCH behind every field edit. `type` is absent on purpose: a
 * source's type is its identity (its `config` shape and its extractor both hang
 * off it) — retyping a row is a delete + create, not an edit.
 *
 * A supplied `config` REPLACES the stored one and is revalidated in full, so a
 * partial write can never leave a row whose config fails its type's schema.
 */
export const UpdateEventSourceBodySchema = z.object({
  name: z.string().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  refresh: z.enum(REFRESH_CADENCES).optional(),
  enabled: z.boolean().optional(),
});
export type UpdateEventSourceBody = z.infer<typeof UpdateEventSourceBodySchema>;

export const listEventSources = defineEndpoint({
  route: "GET /api/events/sources",
  response: z.array(EventSourceSchema),
});

export const getEventSource = defineEndpoint({
  route: "GET /api/events/sources/:id",
  response: EventSourceSchema,
});

export const createEventSource = defineEndpoint({
  route: "POST /api/events/sources",
  body: CreateEventSourceBodySchema,
  response: EventSourceSchema,
});

export const updateEventSource = defineEndpoint({
  route: "PATCH /api/events/sources/:id",
  body: UpdateEventSourceBodySchema,
  response: EventSourceSchema,
});

export const deleteEventSource = defineEndpoint({
  route: "DELETE /api/events/sources/:id",
});

/**
 * The outcome of asking for a refresh — a discriminated result, never a bare
 * boolean, because "we did not start a run" has several genuinely different
 * meanings the UI must distinguish. A `false` (or a `null`) would collapse the
 * disabled-source case onto the already-running case onto a real failure.
 *
 * Things that are NOT in this union because they are errors, not outcomes: an
 * unknown source id (404), a source whose `type` has no registered source type
 * (500 — a broken install), and no refresh engine registered at all (503).
 */
export const RefreshSourceResultSchema = z.discriminatedUnion("status", [
  /** A run was enqueued. `runId` is absent until the engine actually starts it. */
  z.object({ status: z.literal("enqueued") }),
  /** A run for this source is already in flight; the request coalesced into it. */
  z.object({ status: z.literal("already-running") }),
  /** Refused, with a reason the UI can render verbatim. */
  z.object({
    status: z.literal("skipped"),
    reason: z.enum(["disabled"]),
    message: z.string(),
  }),
]);
export type RefreshSourceResult = z.infer<typeof RefreshSourceResultSchema>;

/** Manual "Refresh now". Works in any worktree (only the cadence tick is main-only). */
export const refreshEventSourceNow = defineEndpoint({
  route: "POST /api/events/sources/:id/refresh",
  response: RefreshSourceResultSchema,
});

export const ListEventSourceRunsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).optional(),
});

export const listEventSourceRuns = defineEndpoint({
  route: "GET /api/events/sources/:id/runs",
  query: ListEventSourceRunsQuerySchema,
  response: z.array(EventSourceRunSchema),
});

/**
 * One run, by its own id. Deliberately NOT nested under `/sources/:id`: the run
 * id identifies the row on its own, and a surface that has only the run id (a
 * deep-linked run pane, whose params are own-only) must be able to resolve it
 * without first knowing which source it belongs to — or it would depend on
 * whatever window the runs list happened to have loaded.
 */
export const getEventSourceRun = defineEndpoint({
  route: "GET /api/events/runs/:runId",
  response: EventSourceRunSchema,
});
