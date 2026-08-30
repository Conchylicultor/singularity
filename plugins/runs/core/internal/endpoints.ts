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
