import { asc } from "drizzle-orm";
import { db } from "@server/db/client";
import { defineResource } from "@server/resources";
import {
  ConversationCategoriesPayloadSchema,
  type ConversationCategoriesPayload,
} from "../../shared";
import { _conversationCategoryExt } from "./tables";

export const conversationCategoriesResource = defineResource<ConversationCategoriesPayload>({
  key: "conversation-categories",
  mode: "push",
  schema: ConversationCategoriesPayloadSchema,
  loader: async () => {
    return db
      .select({
        conversationId: _conversationCategoryExt.parentId,
        category: _conversationCategoryExt.category,
        source: _conversationCategoryExt.source,
        classifiedAt: _conversationCategoryExt.updatedAt,
      })
      .from(_conversationCategoryExt)
      .orderBy(asc(_conversationCategoryExt.parentId));
  },
});
