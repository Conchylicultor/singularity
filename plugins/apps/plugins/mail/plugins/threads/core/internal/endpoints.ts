import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { FilterGroupSchema } from "@plugins/primitives/plugins/data-view/core";
import { MailThreadSchema } from "@plugins/apps/plugins/mail/plugins/mail-core/core";

// Wire mirror of the data-view `SortRule` (no zod schema is exported from
// data-view/core, so it's declared here for body validation).
export const SortRuleSchema = z.object({
  fieldId: z.string(),
  direction: z.enum(["asc", "desc"]),
});

export const QueryThreadsBodySchema = z.object({
  /**
   * The active view's whole filter tree — including the mailbox scope, which is
   * now an ORDINARY editable rule of the authored view row (`labels contains
   * INBOX`) rather than a server-derived constant. There is no separate scope
   * input: a tab IS its filter, so the standard `FilterGroup` → `compileWhere` →
   * SQL path carries everything.
   */
  sort: z.array(SortRuleSchema),
  filter: FilterGroupSchema.nullable(),
  query: z.string(),
  cursor: z.string().nullable(),
  limit: z.number().int().positive().max(200),
});
export type QueryThreadsBody = z.infer<typeof QueryThreadsBodySchema>;

export const QueryThreadsResponseSchema = z.object({
  items: z.array(MailThreadSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});

// POST so the structured FilterGroup tree rides in the body. Filter/sort/search
// compile to SQL server-side; pagination is keyset (cursor), not OFFSET.
export const queryThreads = defineEndpoint({
  route: "POST /api/mail/threads/query",
  body: QueryThreadsBodySchema,
  response: QueryThreadsResponseSchema,
});
