import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { ConversationSchema } from "@plugins/tasks/plugins/tasks-core/core";
import { FilterGroupSchema } from "@plugins/primitives/plugins/data-view/core";

// Wire mirror of the data-view `SortRule` (no zod schema is exported from
// data-view/core, so it's declared here for body validation).
export const SortRuleSchema = z.object({
  fieldId: z.string(),
  direction: z.enum(["asc", "desc"]),
});

export const QueryConversationsBodySchema = z.object({
  sort: z.array(SortRuleSchema),
  filter: FilterGroupSchema.nullable(),
  query: z.string(),
  cursor: z.string().nullable(),
  limit: z.number().int().positive().max(200),
  // The DataView surface id (its `storageKey`), injected by `useServerDataSource`.
  // The handler passes it to `augmentServerQuery` so per-surface augmentations
  // (custom columns) can bind their values into the query.
  dataViewId: z.string(),
  // When true, the handler drops the hard `kind != 'system'` exclusion so system
  // conversations are included (default false → byte-for-byte unchanged scope).
  includeSystem: z.boolean().optional(),
});
export type QueryConversationsBody = z.infer<typeof QueryConversationsBodySchema>;

export const QueryConversationsResponseSchema = z.object({
  items: z.array(ConversationSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});

// POST so the structured FilterGroup tree rides in the body. Filter/sort/search
// compile to SQL server-side; pagination is keyset (cursor), not OFFSET.
export const queryConversations = defineEndpoint({
  route: "POST /api/conversations/query",
  body: QueryConversationsBodySchema,
  response: QueryConversationsResponseSchema,
});
