import { text } from "drizzle-orm/pg-core";
import { defineTriggerEvent } from "@plugins/events/server";
import type { ConversationModel } from "../schema";

export interface ConversationCreatedPayload {
  conversationId: string;
  taskId: string;
  model: ConversationModel;
  spawnedBy: string;
  createdAt: string;
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
