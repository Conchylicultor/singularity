import { asc } from "drizzle-orm";
import { db } from "@server/db/client";
import { defineResource } from "@server/resources";
import {
  ConversationCategoriesPayloadSchema,
  type ConversationCategoriesPayload,
} from "../../shared";
import { _conversationCategories } from "./tables";

export const conversationCategoriesResource = defineResource<ConversationCategoriesPayload>({
  key: "conversation-categories",
  mode: "push",
  schema: ConversationCategoriesPayloadSchema,
  loader: async () => {
    return db
      .select({
        conversationId: _conversationCategories.conversationId,
        category: _conversationCategories.category,
        source: _conversationCategories.source,
        classifiedAt: _conversationCategories.classifiedAt,
      })
      .from(_conversationCategories)
      .orderBy(asc(_conversationCategories.conversationId));
  },
});
