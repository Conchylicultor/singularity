import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { RankSchema } from "@plugins/primitives/plugins/rank/core";

const CreateGroupBodySchema = z.object({
  title: z.string().optional(),
  conversationIds: z.array(z.string().min(1)).min(1),
});

export const createConversationGroup = defineEndpoint({
  route: "POST /api/conversation-groups",
  body: CreateGroupBodySchema,
});

const PatchGroupBodySchema = z.object({
  title: z.string().optional(),
  expanded: z.boolean().optional(),
  rank: RankSchema.optional(),
});

export const patchConversationGroup = defineEndpoint({
  route: "PATCH /api/conversation-groups/:id",
  body: PatchGroupBodySchema,
});

export const deleteConversationGroup = defineEndpoint({
  route: "DELETE /api/conversation-groups/:id",
});

const AddGroupMembersBodySchema = z.object({
  conversationIds: z.array(z.string().min(1)).min(1),
});

export const addConversationGroupMembers = defineEndpoint({
  route: "POST /api/conversation-groups/:id/members",
  body: AddGroupMembersBodySchema,
});

export const removeConversationGroupMember = defineEndpoint({
  route: "DELETE /api/conversation-groups/members/:conversationId",
});
