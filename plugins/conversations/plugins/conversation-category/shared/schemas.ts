import { z } from "zod";
import { pointQueryResourceDescriptor } from "@plugins/infra/plugins/query-resource/core";

// Who set the classification. Written once: this IS the `source` column's decoder
// (see server/internal/tables.ts) and the wire schema's own member, so the stored
// set and the pushed set cannot drift apart.
export const CategorySourceSchema = z.enum(["haiku", "manual"]);

export const ConversationCategorySchema = z.object({
  // `categoryRowId(conversationId, categoryId)` — see shared/row-id.ts.
  id: z.string(),
  conversationId: z.string(),
  categoryId: z.string(),
  // The ITEM's name (e.g. "P0"), stored verbatim so a row is readable on its own
  // and survives config edits. Renaming an item in config orphans its rows — the
  // stale label keeps rendering, which beats losing the classification.
  item: z.string(),
  source: CategorySourceSchema,
  classifiedAt: z.coerce.date(),
});
export type ConversationCategory = z.infer<typeof ConversationCategorySchema>;

export const ConversationCategoriesPayloadSchema = z.array(
  ConversationCategorySchema,
);
export type ConversationCategoriesPayload = z.infer<
  typeof ConversationCategoriesPayloadSchema
>;

// Bounded POINT resource. A conversation now holds one row per configured
// category, so the point identity is the (conversation, category) pair folded
// into the `id` primary key — `point.by` must BE the identity pk, because the
// change feed routes a write by intersecting changed row ids with each tuple's
// id set.
//
// Subscribers name the exact rows they render: a sidebar row asks for the ONE
// avatar-category id (same per-row budget as before), the conversation header
// asks for every configured category of the one open conversation. A row whose
// category was deleted from config is therefore structurally invisible — no
// subscribed id set can contain it — which is why nothing sweeps orphans.
//
// NOT bootCritical: point resources hydrate post-mount (the recorded decision),
// and CategoryAvatarRow keeps its title-glyph fallback for the one round-trip.
export const conversationCategoriesResource =
  pointQueryResourceDescriptor<ConversationCategory>(
    "conversation-categories",
    ConversationCategorySchema,
    "id",
  );
