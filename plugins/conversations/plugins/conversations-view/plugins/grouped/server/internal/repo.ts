import { eq, inArray } from "drizzle-orm";
import { Rank } from "@plugins/primitives/plugins/rank/shared";
import { db } from "@server/db/client";
import { nextRankIn, nextRankUnder } from "@plugins/primitives/plugins/rank/server";
import { _conversationGroupMembers, _conversationGroups } from "./tables";
import { conversationGroupsResource } from "./resource";

const GROUP_PREFIX = "cgrp";
const newId = () =>
  `${GROUP_PREFIX}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export interface CreateGroupInput {
  title?: string;
  conversationIds: string[];
}

export async function createGroupWithMembers(input: CreateGroupInput) {
  if (input.conversationIds.length === 0) {
    throw new Error("createGroupWithMembers requires at least one conversation id");
  }
  const id = newId();
  const title = input.title?.trim() || "Group";
  await db.transaction(async (tx) => {
    const rank = await nextRankIn(_conversationGroups, tx);
    await tx.insert(_conversationGroups).values({ id, title, rank: rank.toJSON() });
    // If any of the incoming conversations are already in another group, the
    // PK on conversation_id will reject re-insert. We delete any existing
    // membership rows first so a "drop A onto B" call always lands A in the
    // new group cleanly, regardless of A's prior state.
    await tx
      .delete(_conversationGroupMembers)
      .where(inArray(_conversationGroupMembers.conversationId, input.conversationIds));
    let prevRank: Rank | null = null;
    for (const conversationId of input.conversationIds) {
      const memberRank = Rank.between(prevRank, null);
      await tx.insert(_conversationGroupMembers).values({
        conversationId,
        groupId: id,
        rank: memberRank.toJSON(),
      });
      prevRank = memberRank;
    }
  });
  conversationGroupsResource.notify();
  return { id };
}

export async function addMembersToGroup(groupId: string, conversationIds: string[]) {
  await db.transaction(async (tx) => {
    const [group] = await tx
      .select({ id: _conversationGroups.id })
      .from(_conversationGroups)
      .where(eq(_conversationGroups.id, groupId))
      .limit(1);
    if (!group) throw new Error(`Group ${groupId} not found`);
    for (const conversationId of conversationIds) {
      const rank = await nextRankUnder(_conversationGroupMembers, _conversationGroupMembers.groupId, groupId, tx);
      // Upsert by PK so an already-grouped conversation is moved into this
      // group rather than rejected.
      await tx
        .insert(_conversationGroupMembers)
        .values({ conversationId, groupId, rank: rank.toJSON() })
        .onConflictDoUpdate({
          target: _conversationGroupMembers.conversationId,
          set: { groupId, rank: rank.toJSON(), createdAt: new Date() },
        });
    }
  });
  conversationGroupsResource.notify();
}

export async function addMemberToGroup(groupId: string, conversationId: string) {
  return addMembersToGroup(groupId, [conversationId]);
}

export async function removeMember(conversationId: string): Promise<boolean> {
  const [row] = await db
    .delete(_conversationGroupMembers)
    .where(eq(_conversationGroupMembers.conversationId, conversationId))
    .returning({ conversationId: _conversationGroupMembers.conversationId });
  if (!row) return false;
  conversationGroupsResource.notify();
  return true;
}

export interface UpdateGroupPatch {
  title?: string;
  expanded?: boolean;
  rank?: Rank;
}

export async function updateGroup(id: string, patch: UpdateGroupPatch): Promise<boolean> {
  const dbPatch: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof patch.title === "string") dbPatch.title = patch.title;
  if (typeof patch.expanded === "boolean") dbPatch.expanded = patch.expanded;
  if (patch.rank instanceof Rank) dbPatch.rank = patch.rank.toJSON();
  const [row] = await db
    .update(_conversationGroups)
    .set(dbPatch)
    .where(eq(_conversationGroups.id, id))
    .returning({ id: _conversationGroups.id });
  if (!row) return false;
  conversationGroupsResource.notify();
  return true;
}

export async function deleteGroup(id: string): Promise<boolean> {
  const [row] = await db
    .delete(_conversationGroups)
    .where(eq(_conversationGroups.id, id))
    .returning({ id: _conversationGroups.id });
  if (!row) return false;
  conversationGroupsResource.notify();
  return true;
}
