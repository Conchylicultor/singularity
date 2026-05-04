import { asc } from "drizzle-orm";
import { db } from "@server/db/client";
import { defineResource } from "@server/resources";
import {
  ConversationCategoriesPayloadSchema,
  type ConversationCategoriesPayload,
} from "../../shared";
import { conversationCategory } from "./tables";

const t = conversationCategory.table;

export const conversationCategoriesResource = defineResource<ConversationCategoriesPayload>({
  key: "conversation-categories",
  mode: "push",
  schema: ConversationCategoriesPayloadSchema,
  loader: async () => {
    return db
      .select({
        conversationId: t.parentId,
        category: t.category,
        source: t.source,
        classifiedAt: t.updatedAt,
      })
      .from(t)
      .orderBy(asc(t.parentId));
  },
});
