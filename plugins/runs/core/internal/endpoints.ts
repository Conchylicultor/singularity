import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { FilterGroupSchema } from "@plugins/primitives/plugins/data-view/core";
import { UnionRunSchema } from "./wire";

// Wire mirror of the data-view `SortRule`. data-view/core exports the TYPE but
// no zod schema for it, so every server-delegated query body declares its own
// (the `queryDeployRuns` / `queryReleaseHistory` precedent).
const SortRuleSchema = z.object({
  fieldId: z.string(),
  direction: z.enum(["asc", "desc"]),
});

/**
 * Exactly `ServerDataSourceSpec.fetchPage`'s argument object. It must stay that
 * way: the DataView host owns the live sort / filter / query state and hands it
 * over verbatim, so any field this schema invents is a field nothing sends.
 */
export const QueryRunsBodySchema = z.object({
  sort: z.array(SortRuleSchema),
  filter: FilterGroupSchema.nullable(),
  query: z.string(),
  cursor: z.string().nullable(),
  limit: z.number().int().positive().max(200),
  /** The DataView surface id (its `storageKey`), injected by the host. */
  dataViewId: z.string(),
});
export type QueryRunsBody = z.infer<typeof QueryRunsBodySchema>;

/** Exactly `ServerPage<UnionRun>`. */
export const QueryRunsResponseSchema = z.object({
  items: z.array(UnionRunSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});
export type QueryRunsResponse = z.infer<typeof QueryRunsResponseSchema>;

/**
 * One window of the merged run space, newest first.
 *
 * POST so the structured `FilterGroup` tree rides in the body. Filter / sort /
 * search compile to SQL across every registered arm and pagination is keyset
 * (cursor), never OFFSET — a run ledger only grows, and there is more than one
 * of them.
 */
export const queryRuns = defineEndpoint({
  route: "POST /api/runs/query",
  body: QueryRunsBodySchema,
  response: QueryRunsResponseSchema,
});

/**
 * One merged row, or `null` when the pair names no run.
 *
 * `null` is an ANSWER, not an absence of one: it says the ledger was read and
 * holds no such row. A transport failure is a rejection, so a caller can still
 * tell "this run is gone" apart from "nobody could tell me" — which is the whole
 * reason this is a nullable field over a 200 rather than a 404.
 */
export const RunByIdResponseSchema = z.object({
  run: UnionRunSchema.nullable(),
});
export type RunByIdResponse = z.infer<typeof RunByIdResponseSchema>;

/**
 * One run, addressed by the PAIR that names it.
 *
 * Never a bare id, for the same reason `runRowKey` is not one: a run id is
 * unique only within its **own** ledger, so two ledgers can mint the same one.
 * A by-id lookup would then have to search every arm and pick a winner, and the
 * one it picked would depend on registration order. The kind makes the address
 * total — and, on the server, it is also what lets exactly one arm be compiled
 * instead of a union of all of them.
 *
 * `dedupe: true` because a detail pane is several sections asking about the same
 * row at the same instant; they should cost one query, not one each.
 */
export const getRun = defineEndpoint({
  route: "GET /api/runs/:kind/:id",
  response: RunByIdResponseSchema,
  dedupe: true,
});
