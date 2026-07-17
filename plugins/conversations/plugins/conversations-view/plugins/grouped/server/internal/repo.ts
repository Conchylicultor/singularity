import { eq, inArray } from "drizzle-orm";
import { Rank, computeFlatReorder } from "@plugins/primitives/plugins/rank/core";
import { db } from "@plugins/database/server";
import { nextRankIn, nextRankUnder } from "@plugins/primitives/plugins/rank/server";
import { _conversationGroupMembers, _conversationGroups } from "./tables";

const GROUP_PREFIX = "cgrp";
const newId = () =>
  `${GROUP_PREFIX}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export interface CreateGroupInput {
  title?: string;
  // Optional: creating a group with no members is legitimate — the tree's
  // "New group" affordance mints an empty group and opens its label into
  // rename. Groups persist when empty regardless (only an explicit remove
  // deletes one). Absent is normalized to `[]` below.
  conversationIds?: string[];
}

export async function createGroupWithMembers(input: CreateGroupInput) {
  const id = newId();
  const title = input.title?.trim() || "Group";
  const conversationIds = input.conversationIds ?? [];
  await db.transaction(async (tx) => {
    const rank = await nextRankIn(_conversationGroups, tx);
    await tx.insert(_conversationGroups).values({ id, title, rank: rank.toJSON() });
    // An empty group is a complete create — the group row above is all there
    // is to write. Returning early also keeps `inArray` off an empty list.
    if (conversationIds.length === 0) return;
    // If any of the incoming conversations are already in another group, the
    // PK on conversation_id will reject re-insert. We delete any existing
    // membership rows first so a "drop A onto B" call always lands A in the
    // new group cleanly, regardless of A's prior state.
    await tx
      .delete(_conversationGroupMembers)
      .where(inArray(_conversationGroupMembers.conversationId, conversationIds));
    let prevRank: Rank | null = null;
    for (const conversationId of conversationIds) {
      const memberRank = Rank.between(prevRank, null);
      await tx.insert(_conversationGroupMembers).values({
        conversationId,
        groupId: id,
        rank: memberRank.toJSON(),
      });
      prevRank = memberRank;
    }
  });
  return { id };
}

export async function addMembersToGroup(groupId: string, conversationIds: string[]) {
  await db.transaction(async (tx) => {
    const [group] = await tx
      .select({ id: _conversationGroups.id })
      .from(_conversationGroups)
      .where(eq(_conversationGroups.id, groupId))
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
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
}

export async function addMemberToGroup(groupId: string, conversationId: string) {
  return addMembersToGroup(groupId, [conversationId]);
}

export type MoveMemberResult =
  | { ok: true }
  | { ok: false; reason: "target-not-a-member" | "rank-unresolvable" };

/**
 * Neighbour-based member reorder: place `conversationId` immediately
 * `zone` of member `targetId`. The rank is resolved here, against the
 * **complete** member set of the target's group — the client only ever sees a
 * filtered/synthetic projection of that set, so it can never mint a valid rank
 * itself. Dropping next to a member of another group moves the conversation
 * into that group (same upsert-by-PK semantics as `addMembersToGroup`).
 */
export async function moveMember(
  conversationId: string,
  targetId: string,
  zone: "before" | "after",
): Promise<MoveMemberResult> {
  // A self-drop resolves to the identity move — nothing was asked for, so
  // nothing is written. Mirrors the queue's reorder handler.
  if (conversationId === targetId) return { ok: true };

  return db.transaction(async (tx): Promise<MoveMemberResult> => {
    const [target] = await tx
      .select({ groupId: _conversationGroupMembers.groupId })
      .from(_conversationGroupMembers)
      .where(eq(_conversationGroupMembers.conversationId, targetId))
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
    if (!target) return { ok: false, reason: "target-not-a-member" };
    const groupId = target.groupId;

    // Lock and read the whole destination sibling set in one go, so the
    // neighbourhood computeFlatReorder sees cannot shift under a concurrent move.
    const siblings = await tx
      .select({
        conversationId: _conversationGroupMembers.conversationId,
        rank: _conversationGroupMembers.rank,
      })
      .from(_conversationGroupMembers)
      .where(eq(_conversationGroupMembers.groupId, groupId))
      .for("update");

    const rank = computeFlatReorder(
      siblings.map((s) => ({ id: s.conversationId, rank: Rank.from(s.rank) })),
      conversationId,
      zone,
      targetId,
    );
    // `null` here means the drop is genuinely impossible (target vanished
    // between the two reads, or rank exhaustion) — surface it, never silently
    // no-op a move the user asked for.
    if (!rank) return { ok: false, reason: "rank-unresolvable" };

    // Upsert by PK: the conversation may be ungrouped or in another group today.
    await tx
      .insert(_conversationGroupMembers)
      .values({ conversationId, groupId, rank: rank.toJSON() })
      .onConflictDoUpdate({
        target: _conversationGroupMembers.conversationId,
        set: { groupId, rank: rank.toJSON() },
      });
    return { ok: true };
  });
}

export async function removeMember(conversationId: string): Promise<boolean> {
  const [row] = await db
    .delete(_conversationGroupMembers)
    .where(eq(_conversationGroupMembers.conversationId, conversationId))
    .returning({ conversationId: _conversationGroupMembers.conversationId });
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!row) return false;
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
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!row) return false;
  return true;
}

export async function deleteGroup(id: string): Promise<boolean> {
  const [row] = await db
    .delete(_conversationGroups)
    .where(eq(_conversationGroups.id, id))
    .returning({ id: _conversationGroups.id });
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!row) return false;
  return true;
}
