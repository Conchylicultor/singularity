import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { RankSchema } from "@plugins/primitives/plugins/rank/core";

export const createGroupBodySchema = z.object({
  title: z.string().optional(),
  contributionIds: z.array(z.string().min(1)).optional(),
});
export type CreateGroupBody = z.infer<typeof createGroupBodySchema>;

export const patchGroupBodySchema = z.object({
  slotId: z.string(),
  title: z.string().optional(),
  expanded: z.boolean().optional(),
  rank: RankSchema.optional(),
});
export type PatchGroupBody = z.infer<typeof patchGroupBodySchema>;

export const deleteGroupBodySchema = z.object({
  slotId: z.string(),
});
export type DeleteGroupBody = z.infer<typeof deleteGroupBodySchema>;

export const addMembersBodySchema = z.object({
  slotId: z.string(),
  contributionIds: z.array(z.string().min(1)).min(1),
});
export type AddMembersBody = z.infer<typeof addMembersBodySchema>;

export const createGroup = defineEndpoint({
  route: "POST /api/reorder/:slotId/groups",
  body: createGroupBodySchema,
});

export const patchGroup = defineEndpoint({
  route: "PATCH /api/reorder/groups/:id",
  body: patchGroupBodySchema,
});

export const deleteGroup = defineEndpoint({
  route: "DELETE /api/reorder/groups/:id",
  body: deleteGroupBodySchema,
});

export const addMembers = defineEndpoint({
  route: "POST /api/reorder/groups/:id/members",
  body: addMembersBodySchema,
});

export const removeMemberEndpoint = defineEndpoint({
  route: "DELETE /api/reorder/:slotId/groups/members/:contributionId",
});
