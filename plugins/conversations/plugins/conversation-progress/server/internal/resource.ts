import { asc } from "drizzle-orm";
import { db } from "@server/db/client";
import { defineResource } from "@server/resources";
import {
  ConversationProgressPayloadSchema,
  type ConversationProgressPayload,
} from "../../shared/schemas";
import { _conversationProgress } from "./tables";

export const conversationProgressResource =
  defineResource<ConversationProgressPayload>({
    key: "conversation-progress",
    mode: "push",
    schema: ConversationProgressPayloadSchema,
    loader: async () => {
      return db
        .select({
          conversationId: _conversationProgress.conversationId,
          phase: _conversationProgress.phase,
          source: _conversationProgress.source,
          updatedAt: _conversationProgress.updatedAt,
        })
        .from(_conversationProgress)
        .orderBy(asc(_conversationProgress.conversationId));
    },
  });
