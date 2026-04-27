import type { Conversation } from "@plugins/tasks-core/shared";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/shared";

export type ConversationEntry = Conversation;

export type ConversationListPayload = {
  active: ConversationEntry[];
  recentGone: ConversationEntry[];
  hasMoreGone: boolean;
  system: ConversationEntry[];
};

export const recentConversationsResource = resourceDescriptor<ConversationListPayload>("conversations");
