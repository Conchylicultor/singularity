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

export const QueryInboxBodySchema = z.object({
  sort: z.array(SortRuleSchema),
  filter: FilterGroupSchema.nullable(),
  query: z.string(),
  cursor: z.string().nullable(),
  limit: z.number().int().positive().max(200),
});
export type QueryInboxBody = z.infer<typeof QueryInboxBodySchema>;

export const QueryInboxResponseSchema = z.object({
  items: z.array(MailThreadSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});

// POST so the structured FilterGroup tree rides in the body. Filter/sort/search
// compile to SQL server-side; pagination is keyset (cursor), not OFFSET. The
// INBOX ("not archived") scope is server-fixed — not a body-supplied filter.
export const queryInbox = defineEndpoint({
  route: "POST /api/mail/inbox/query",
  body: QueryInboxBodySchema,
  response: QueryInboxResponseSchema,
});
