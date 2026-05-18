import { asc, eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import {
  ReorderGroupsPayloadSchema,
  type ReorderGroupsPayload,
} from "../../core";
import { _reorderGroupMembers, _reorderGroups } from "./tables";

export const reorderGroupsResource = defineResource<
  ReorderGroupsPayload,
  { slotId: string }
>({
  key: "reorder.groups",
  mode: "push",
  schema: ReorderGroupsPayloadSchema,
  loader: async ({ slotId }): Promise<ReorderGroupsPayload> => {
    const [groups, members] = await Promise.all([
      db
        .select()
        .from(_reorderGroups)
        .where(eq(_reorderGroups.slotId, slotId))
        .orderBy(asc(_reorderGroups.rank), asc(_reorderGroups.createdAt)),
      db
        .select({
          contributionId: _reorderGroupMembers.contributionId,
          slotId: _reorderGroupMembers.slotId,
          groupId: _reorderGroupMembers.groupId,
          rank: _reorderGroupMembers.rank,
        })
        .from(_reorderGroupMembers)
        .where(eq(_reorderGroupMembers.slotId, slotId))
        .orderBy(asc(_reorderGroupMembers.rank)),
    ]);
    return { groups, members } as unknown as ReorderGroupsPayload;
  },
});
