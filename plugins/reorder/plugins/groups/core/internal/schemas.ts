import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { RankSchema } from "@plugins/primitives/plugins/rank/core";

export const ReorderGroupSchema = z.object({
  id: z.string(),
  slotId: z.string(),
  title: z.string(),
  expanded: z.boolean(),
  rank: RankSchema,
  createdAt: z.coerce.date(),
});
export type ReorderGroup = z.infer<typeof ReorderGroupSchema>;

export const ReorderGroupMemberSchema = z.object({
  contributionId: z.string(),
  slotId: z.string(),
  groupId: z.string(),
  rank: RankSchema,
});
export type ReorderGroupMember = z.infer<typeof ReorderGroupMemberSchema>;

export const ReorderGroupsPayloadSchema = z.object({
  groups: z.array(ReorderGroupSchema),
  members: z.array(ReorderGroupMemberSchema),
});
export type ReorderGroupsPayload = z.infer<typeof ReorderGroupsPayloadSchema>;

export const reorderGroupsResource = resourceDescriptor<
  ReorderGroupsPayload,
  { slotId: string }
>("reorder.groups", ReorderGroupsPayloadSchema, { groups: [], members: [] });
