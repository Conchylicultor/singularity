import type { Conversation } from "@plugins/tasks-core/core";
import { ConversationListPayloadSchema } from "@plugins/tasks-core/core";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";

export type ConversationEntry = Conversation;

export type ConversationListPayload = {
  active: ConversationEntry[];
  recentGone: ConversationEntry[];
  hasMoreGone: boolean;
  totalGoneCount: number;
  system: ConversationEntry[];
};

export const recentConversationsResource = resourceDescriptor<ConversationListPayload>("conversations", ConversationListPayloadSchema, { active: [], recentGone: [], hasMoreGone: false, totalGoneCount: 0, system: [] });
