import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { RankSchema } from "@plugins/primitives/plugins/rank/core";

export const ConversationGroupSchema = z.object({
  id: z.string(),
  title: z.string(),
  expanded: z.boolean(),
  rank: RankSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type ConversationGroup = z.infer<typeof ConversationGroupSchema>;

export const ConversationGroupMemberSchema = z.object({
  conversationId: z.string(),
  groupId: z.string(),
  rank: RankSchema,
});
export type ConversationGroupMember = z.infer<typeof ConversationGroupMemberSchema>;

export const ConversationGroupsPayloadSchema = z.object({
  groups: z.array(ConversationGroupSchema),
  members: z.array(ConversationGroupMemberSchema),
});
export type ConversationGroupsPayload = z.infer<typeof ConversationGroupsPayloadSchema>;

export const conversationGroupsResource = resourceDescriptor<ConversationGroupsPayload>(
  "conversation-groups",
  ConversationGroupsPayloadSchema,
  { groups: [], members: [] },
  { bootCritical: true },
);
