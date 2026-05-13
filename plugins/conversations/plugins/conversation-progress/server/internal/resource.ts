import { asc } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineResource } from "@server/resources";
import {
  ConversationProgressPayloadSchema,
  type ConversationProgressPayload,
} from "@plugins/conversations/plugins/conversation-progress/shared/schemas";
import { conversationProgress } from "./tables";

export const conversationProgressResource =
  defineResource<ConversationProgressPayload>({
    key: "conversation-progress",
    mode: "push",
    schema: ConversationProgressPayloadSchema,
    loader: async () => {
      return db
        .select({
          conversationId: conversationProgress.table.parentId,
          phase: conversationProgress.table.phase,
          source: conversationProgress.table.source,
          updatedAt: conversationProgress.table.updatedAt,
        })
        .from(conversationProgress.table)
        .orderBy(asc(conversationProgress.table.parentId));
    },
  });
