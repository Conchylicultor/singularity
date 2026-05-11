import { and, eq, inArray } from "drizzle-orm";
import { Rank } from "@plugins/primitives/plugins/rank/shared";
import { db } from "@plugins/database/server";
import { nextRankUnder } from "@plugins/primitives/plugins/rank/server";
import { _reorderGroupMembers, _reorderGroups } from "./tables";
import { reorderGroupsResource } from "./resource";

const GROUP_PREFIX = "rgrp";
const newId = () =>
  `${GROUP_PREFIX}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export interface CreateGroupInput {
  slotId: string;
  title?: string;
  contributionIds?: string[];
}

export async function createGroup(input: CreateGroupInput) {
  const id = newId();
  const title = input.title?.trim() || "Group";
  const contributionIds = input.contributionIds ?? [];
  await db.transaction(async (tx) => {
    const rank = await nextRankUnder(
      _reorderGroups,
      _reorderGroups.slotId,
      input.slotId,
      tx,
    );
    await tx.insert(_reorderGroups).values({
      id,
      slotId: input.slotId,
      title,
      rank: rank.toJSON(),
    });
    if (contributionIds.length > 0) {
      await tx
        .delete(_reorderGroupMembers)
        .where(
          and(
            eq(_reorderGroupMembers.slotId, input.slotId),
            inArray(_reorderGroupMembers.contributionId, contributionIds),
          ),
        );
      let prevRank: Rank | null = null;
      for (const contributionId of contributionIds) {
        const memberRank = Rank.between(prevRank, null);
        await tx.insert(_reorderGroupMembers).values({
          slotId: input.slotId,
          contributionId,
          groupId: id,
          rank: memberRank.toJSON(),
        });
        prevRank = memberRank;
      }
    }
  });
  reorderGroupsResource.notify({ slotId: input.slotId });
  return { id };
}

export async function addMembersToGroup(
  groupId: string,
  slotId: string,
  contributionIds: string[],
) {
  await db.transaction(async (tx) => {
    const [group] = await tx
      .select({ id: _reorderGroups.id })
      .from(_reorderGroups)
      .where(eq(_reorderGroups.id, groupId))
      .limit(1);
    if (!group) throw new Error(`Group ${groupId} not found`);
    for (const contributionId of contributionIds) {
      const rank = await nextRankUnder(
        _reorderGroupMembers,
        _reorderGroupMembers.groupId,
        groupId,
        tx,
      );
      await tx
        .insert(_reorderGroupMembers)
        .values({ slotId, contributionId, groupId, rank: rank.toJSON() })
        .onConflictDoUpdate({
          target: [
            _reorderGroupMembers.slotId,
            _reorderGroupMembers.contributionId,
          ],
          set: { groupId, rank: rank.toJSON() },
        });
    }
  });
  reorderGroupsResource.notify({ slotId });
}

export async function removeMember(
  slotId: string,
  contributionId: string,
): Promise<boolean> {
  const [row] = await db
    .delete(_reorderGroupMembers)
    .where(
      and(
        eq(_reorderGroupMembers.slotId, slotId),
        eq(_reorderGroupMembers.contributionId, contributionId),
      ),
    )
    .returning({ contributionId: _reorderGroupMembers.contributionId });
  if (!row) return false;
  reorderGroupsResource.notify({ slotId });
  return true;
}

export interface UpdateGroupPatch {
  title?: string;
  expanded?: boolean;
  rank?: Rank;
}

export async function updateGroup(
  id: string,
  slotId: string,
  patch: UpdateGroupPatch,
): Promise<boolean> {
  const dbPatch: Record<string, unknown> = {};
  if (typeof patch.title === "string") dbPatch.title = patch.title;
  if (typeof patch.expanded === "boolean") dbPatch.expanded = patch.expanded;
  if (patch.rank instanceof Rank) dbPatch.rank = patch.rank.toJSON();
  const [row] = await db
    .update(_reorderGroups)
    .set(dbPatch)
    .where(eq(_reorderGroups.id, id))
    .returning({ id: _reorderGroups.id });
  if (!row) return false;
  reorderGroupsResource.notify({ slotId });
  return true;
}

export async function deleteGroup(id: string, slotId: string): Promise<boolean> {
  const [row] = await db
    .delete(_reorderGroups)
    .where(eq(_reorderGroups.id, id))
    .returning({ id: _reorderGroups.id });
  if (!row) return false;
  reorderGroupsResource.notify({ slotId });
  return true;
}
