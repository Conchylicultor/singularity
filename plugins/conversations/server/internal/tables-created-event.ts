import { text } from "drizzle-orm/pg-core";
import { defineTriggerEvent } from "@plugins/infra/plugins/events/server";
import type { ConversationModel } from "@plugins/conversations/plugins/model-provider/core";

export interface ConversationCreatedPayload {
  conversationId: string;
  taskId: string;
  model: ConversationModel;
  spawnedBy: string;
  createdAt: string;
  prompt?: string;
  kind?: string;
  prepromptId?: string;
  [key: string]: unknown;
}

export const {
  event: conversationCreated,
  table: _conversationCreatedTriggers,
} = defineTriggerEvent<ConversationCreatedPayload>({
  name: "conversation.created",
  filters: {
    conversationId: text("conversation_id"),
  },
});
