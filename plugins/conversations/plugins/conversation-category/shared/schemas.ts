import { z } from "zod";
import { pointQueryResourceDescriptor } from "@plugins/infra/plugins/query-resource/core";

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

// Bounded POINT resource: a consumer subscribes by an explicit conversation-id
// set (`usePointResource(resource, convId)` → one row-or-null), so a category
// read costs O(1) instead of an O(n) `.find()` over the whole collection. Rows
// key on `conversationId` — the ALIAS the server projection exposes the
// side-table's `parent_id` PK under (which IS the point identity). NOT
// bootCritical: point resources hydrate post-mount (the recorded decision), and
// the CategoryAvatarRow keeps its title-glyph fallback for the one round-trip.
export const conversationCategoriesResource =
  pointQueryResourceDescriptor<ConversationCategory>(
    "conversation-categories",
    ConversationCategorySchema,
    "conversationId",
  );
