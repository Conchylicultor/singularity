import type { Conversation } from "@plugins/tasks-core/shared";
import { resourceDescriptor } from "@core/shared/resource";

export type ConversationEntry = Conversation;

export type ConversationListPayload = {
  active: ConversationEntry[];
  recentGone: ConversationEntry[];
  hasMoreGone: boolean;
};

export const recentConversationsResource = resourceDescriptor<ConversationListPayload>("conversations");
