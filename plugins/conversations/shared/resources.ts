import type { Conversation } from "@plugins/tasks-core/shared";
import { ConversationListPayloadSchema } from "@plugins/tasks-core/shared";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/shared";

export type ConversationEntry = Conversation;

export type ConversationListPayload = {
  active: ConversationEntry[];
  recentGone: ConversationEntry[];
  hasMoreGone: boolean;
  totalGoneCount: number;
  system: ConversationEntry[];
};

export const recentConversationsResource = resourceDescriptor<ConversationListPayload>("conversations", ConversationListPayloadSchema, { active: [], recentGone: [], hasMoreGone: false, totalGoneCount: 0, system: [] });
