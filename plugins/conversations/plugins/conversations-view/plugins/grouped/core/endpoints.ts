import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { RankSchema } from "@plugins/primitives/plugins/rank/core";

const CreateGroupBodySchema = z.object({
  title: z.string().optional(),
  // Empty is a legitimate create: the tree's native "New group" affordance mints
  // an empty group and opens its label into rename. Groups already persist when
  // empty (only an explicit remove deletes one), so this is not a new state.
  conversationIds: z.array(z.string().min(1)).default([]),
});

export const createConversationGroup = defineEndpoint({
  route: "POST /api/conversation-groups",
  body: CreateGroupBodySchema,
  response: z.object({ id: z.string() }),
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

const MoveGroupMemberBodySchema = z.object({
  targetId: z.string().min(1),
  zone: z.enum(["before", "after"]),
});

// Neighbour-based member reorder, mirroring `reorderQueue`: the client names a
// target member and a side, never a rank. The rank is resolved server-side
// against the COMPLETE sibling set of the target's group, because the client
// only ever sees a filtered/synthetic projection of it (rank primitive's
// filtered-projection rule). Dropping onto a member of another group moves the
// conversation into that group.
export const moveConversationGroupMember = defineEndpoint({
  route: "POST /api/conversation-groups/members/:conversationId/move",
  body: MoveGroupMemberBodySchema,
});
