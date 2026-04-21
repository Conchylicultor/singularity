import type { Conversation } from "./types";
import { resourceDescriptor } from "@core/shared/resource";

export type ConversationEntry = Conversation;

export type ConversationListPayload = {
  active: ConversationEntry[];
  recentGone: ConversationEntry[];
  hasMoreGone: boolean;
};

export const recentConversationsResource = resourceDescriptor<ConversationListPayload>("conversations");
