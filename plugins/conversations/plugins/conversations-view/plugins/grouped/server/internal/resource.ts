import { asc } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { _conversationGroupMembers, _conversationGroups } from "./tables";
import {
  conversationGroupsResource as conversationGroupsDescriptor,
  type ConversationGroupsPayload,
} from "../../shared";

export const conversationGroupsResource = defineResource(conversationGroupsDescriptor, {
  mode: "push",
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
