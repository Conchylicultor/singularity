import { asc } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineResource } from "@server/resources";
import { _conversationGroupMembers, _conversationGroups } from "./tables";
import {
  ConversationGroupsPayloadSchema,
  type ConversationGroupsPayload,
} from "../../shared";

export const conversationGroupsResource = defineResource<ConversationGroupsPayload>({
  key: "conversation-groups",
  mode: "push",
  schema: ConversationGroupsPayloadSchema,
  loader: async () => {
    const [groups, members] = await Promise.all([
      db
        .select()
        .from(_conversationGroups)
        .orderBy(asc(_conversationGroups.rank), asc(_conversationGroups.createdAt)),
      db
        .select({
          conversationId: _conversationGroupMembers.conversationId,
          groupId: _conversationGroupMembers.groupId,
          rank: _conversationGroupMembers.rank,
        })
        .from(_conversationGroupMembers)
        .orderBy(asc(_conversationGroupMembers.rank)),
    ]);
    return { groups, members } as unknown as ConversationGroupsPayload;
  },
});
