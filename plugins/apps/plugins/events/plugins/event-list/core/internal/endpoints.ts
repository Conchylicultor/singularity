import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { FilterGroupSchema } from "@plugins/primitives/plugins/data-view/core";
import { EventSchema } from "@plugins/apps/plugins/events/plugins/events-core/core";

// Wire mirror of the data-view `SortRule` (no zod schema is exported from
// data-view/core, so it's declared here for body validation).
export const SortRuleSchema = z.object({
  fieldId: z.string(),
  direction: z.enum(["asc", "desc"]),
});

export const QueryEventsBodySchema = z.object({
  sort: z.array(SortRuleSchema),
  filter: FilterGroupSchema.nullable(),
  query: z.string(),
  cursor: z.string().nullable(),
  limit: z.number().int().positive().max(200),
});
export type QueryEventsBody = z.infer<typeof QueryEventsBodySchema>;

export const QueryEventsResponseSchema = z.object({
  items: z.array(EventSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});

// POST so the structured FilterGroup tree rides in the body. Filter/sort/search
// compile to SQL server-side; pagination is keyset (cursor), not OFFSET — the
// events set grows without bound and the user filters/sorts across all of it.
export const queryEvents = defineEndpoint({
  route: "POST /api/events/query",
  body: QueryEventsBodySchema,
  response: QueryEventsResponseSchema,
});
