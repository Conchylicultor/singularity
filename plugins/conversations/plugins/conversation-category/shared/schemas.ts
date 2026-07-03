import { z } from "zod";
import { queryResourceDescriptor } from "@plugins/infra/plugins/query-resource/core";

export const ConversationCategorySchema = z.object({
  conversationId: z.string(),
  category: z.string(),
  source: z.enum(["haiku", "manual"]),
  classifiedAt: z.coerce.date(),
});
export type ConversationCategory = z.infer<typeof ConversationCategorySchema>;

export const ConversationCategoriesPayloadSchema = z.array(
  ConversationCategorySchema,
);
export type ConversationCategoriesPayload = z.infer<
  typeof ConversationCategoriesPayloadSchema
>;

// Keyed query-resource contract: rows key on `conversationId` — the ALIAS the
// server projection exposes the side-table's `parent_id` PK under (the
// conversation-progress precedent). The server half is compiled from the drizzle
// declaration in `server/internal/resource.ts`; the wire shape stays
// `ConversationCategory[]`. orderBy asc(parentId) is immutable, so a re-classify
// (UPDATE of category/source/classifiedAt) ships as one scoped keyed delta.
export const conversationCategoriesResource =
  queryResourceDescriptor<ConversationCategory>(
    "conversation-categories",
    ConversationCategorySchema,
    "conversationId",
    { bootCritical: true },
  );
