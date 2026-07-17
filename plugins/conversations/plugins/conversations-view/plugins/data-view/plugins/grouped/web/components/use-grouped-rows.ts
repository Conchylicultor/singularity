import { useCallback, useMemo } from "react";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import type { Conversation } from "@plugins/tasks/plugins/tasks-core/core";
import { tasksResource } from "@plugins/tasks/plugins/tasks-core/core";
import { useResource, useCombinedResources } from "@plugins/primitives/plugins/live-state/web";
import { useDraft } from "@plugins/primitives/plugins/persistent-draft/web";
import { useConversations } from "@plugins/conversations/web";
import {
  conversationGroupsResource,
  type ConversationGroup,
} from "@plugins/conversations/plugins/conversations-view/plugins/grouped/core";
import { computeAutoGroups, type AttemptGroup } from "./use-auto-groups";

/** The two synthetic root buckets. Ids are in the same space as `rowKey`. */
export const BUCKET_UNGROUPED = "bucket:ungrouped";
export const BUCKET_CLOSED = "bucket:closed";

/** `auto:${clusterKey}` — the row id of a derived task auto-group. */
export const autoGroupRowId = (clusterKey: string): string => `auto:${clusterKey}`;

// Device-local expand state for the rows with no server-side `expanded` column
// (auto-groups and the two buckets). User groups persist theirs in the DB.
// A never-expiring TTL: an expand map is a preference, not a draft.
const LOCAL_EXPANDED_KEY = "conversations-sidebar-grouped:expanded";
const NEVER_EXPIRES = Number.MAX_SAFE_INTEGER;

/**
 * One flat DataView row per rendered node. A discriminated union because the
 * tree resolves `getParentId` against rows **in the same array** — so the
 * groups/buckets a conversation hangs under must themselves be rows. Every
 * `HierarchyConfig` accessor dispatches on `kind`.
 */
export type GroupedRow =
  | {
      kind: "group";
      id: string;
      title: string;
      parentId: null;
      rank: Rank;
      expanded: boolean;
      /** Member attempt-groups — the count badge, and the delete-label switch. */
      count: number;
    }
  | {
      kind: "auto-group";
      id: string;
      title: string;
      parentId: null;
      rank: Rank;
      expanded: boolean;
      /** The cluster's root conversation ids — promoted verbatim into a real group. */
      rootConvIds: string[];
    }
  | {
      kind: "bucket";
      id: typeof BUCKET_UNGROUPED | typeof BUCKET_CLOSED;
      title: string;
      parentId: null;
      rank: Rank;
      expanded: boolean;
    }
  | {
      kind: "conv";
      id: string;
      title: string;
      /** A group / auto-group / bucket row id. */
      parentId: string;
      rank: Rank;
      conv: Conversation;
      /** The user group this conversation is a member of, or null. */
      groupId: string | null;
    }
  | {
      kind: "fork";
      id: string;
      title: string;
      /** The root conversation's id. */
      parentId: string;
      rank: Rank;
      conv: Conversation;
    };

export interface GroupedRowsResult {
  rows: GroupedRow[];
  /**
   * The COMPLETE, unfiltered user-group list in rank order. Group reorder is the
   * one place the client legitimately mints a rank, and only because it holds
   * this — never `dest.rank`, which the tree computed over a projection that also
   * contains minted synthetic ranks.
   */
  groups: ConversationGroup[];
  rowById: Map<string, GroupedRow>;
  /**
   * rootConvId → every rootConvId in the same auto-group cluster (classic's
   * "drag one, move the cluster" set). Absent for a conversation in no cluster.
   */
  autoGroupSiblings: Map<string, string[]>;
  /** Toggle the device-local expand state of an auto-group / bucket row. */
  setLocalExpanded: (id: string, next: boolean) => void;
  pending: boolean;
}

/**
 * Combines the grouped tab's live resources — `conversation-groups`, `tasks`,
 * and the conversation lists — and flattens them into the tree's flat
 * `GroupedRow[]`: user groups (rank asc) → task auto-groups → Ungrouped →
 * Closed, each with its member conversations (and their forks) as children.
 *
 * Gates on **every** resource together (classic does the same): classifying from
 * a half-loaded snapshot would briefly show grouped conversations as ungrouped.
 *
 * **Ranks for the synthetic rows are minted, not borrowed** — the sanctioned
 * precedent for a projection the storage layer has no ordering space for (the
 * tree's own alias nodes do exactly this). A minted rank is projection-local, so
 * this consumer MUST be endpoint-based (`dest.targetId`/`dest.zone`).
 */
export function useGroupedRows(): GroupedRowsResult {
  const groupsResult = useResource(conversationGroupsResource);
  const tasksResult = useResource(tasksResource);
  const all = useCombinedResources({ groups: groupsResult, tasks: tasksResult });
  const conv = useConversations();

  const [localExpanded, setLocalExpandedMap] = useDraft<Record<string, boolean>>(
    LOCAL_EXPANDED_KEY,
    {},
    { ttl: NEVER_EXPIRES },
  );

  const setLocalExpanded = useCallback(
    (id: string, next: boolean) => {
      setLocalExpandedMap((prev) => ({ ...prev, [id]: next }));
    },
    [setLocalExpandedMap],
  );

  const pending = all.pending || conv.pending;

  const { rows, groups, rowById, autoGroupSiblings } = useMemo<
    Pick<GroupedRowsResult, "rows" | "groups" | "rowById" | "autoGroupSiblings">
  >(() => {
    if (all.pending || conv.pending) {
      return {
        rows: [],
        groups: [],
        rowById: new Map(),
        autoGroupSiblings: new Map(),
      };
    }

    const groups = all.data.groups.groups;
    const members = all.data.groups.members;
    const { active, system, recentGone } = conv;

    const groupIdByConvId = new Map<string, string>();
    for (const m of members) groupIdByConvId.set(m.conversationId, m.groupId);

    // Members arrive from the server already sorted by rank (asc).
    const memberConvIdsByGroupId = new Map<string, string[]>();
    for (const m of members) {
      const list = memberConvIdsByGroupId.get(m.groupId) ?? [];
      list.push(m.conversationId);
      memberConvIdsByGroupId.set(m.groupId, list);
    }

    // Fork collapse: conversations sharing an attemptId are one display unit
    // ([root, ...forks], oldest first). System conversations are always folded in
    // — visibility is the `kind` field's filter, not a partition (the DataView
    // filter pill replaces classic's eye toggle).
    const byAttempt = new Map<string, Conversation[]>();
    for (const c of [...active, ...system]) {
      const list = byAttempt.get(c.attemptId) ?? [];
      list.push(c);
      byAttempt.set(c.attemptId, list);
    }
    const attemptGroupsInOrder: AttemptGroup[] = Array.from(byAttempt.values()).map((g) =>
      [...g].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
    );

    const attemptGroupByRootConvId = new Map<string, AttemptGroup>();
    for (const ag of attemptGroupsInOrder) {
      const root = ag[0];
      if (root) attemptGroupByRootConvId.set(root.id, ag);
    }

    const groupedAttemptGroups = new Map<string, AttemptGroup[]>();
    for (const g of groups) {
      const ags: AttemptGroup[] = [];
      for (const convId of memberConvIdsByGroupId.get(g.id) ?? []) {
        const ag = attemptGroupByRootConvId.get(convId);
        if (ag) ags.push(ag);
      }
      groupedAttemptGroups.set(g.id, ags);
    }

    const ungroupedAttemptGroups = attemptGroupsInOrder.filter((ag) => {
      const root = ag[0];
      return root ? !groupIdByConvId.has(root.id) : false;
    });

    const { autoGroups, trulyUngrouped } = computeAutoGroups(
      ungroupedAttemptGroups,
      all.data.tasks,
    );

    const autoGroupSiblings = new Map<string, string[]>();
    for (const ag of autoGroups) {
      for (const convId of ag.rootConvIds) autoGroupSiblings.set(convId, ag.rootConvIds);
    }

    const out: GroupedRow[] = [];
    // Root order: user groups (by their own rank) → auto-groups → Ungrouped → Closed.
    const rootRanks = Rank.nBetween(null, null, groups.length + autoGroups.length + 2);
    let rootIdx = 0;

    /** Emit an attempt-group as a conv row (+ its forks) under `parentId`. */
    const emitAttemptGroup = (
      ag: AttemptGroup,
      parentId: string,
      rank: Rank,
      groupId: string | null,
    ): void => {
      const [root, ...forks] = ag;
      if (!root) return;
      out.push({
        kind: "conv",
        id: root.id,
        title: root.title ?? "",
        parentId,
        rank,
        conv: root,
        groupId,
      });
      const forkRanks = Rank.nBetween(null, null, forks.length);
      forks.forEach((fork, i) => {
        out.push({
          kind: "fork",
          id: fork.id,
          title: fork.title ?? "",
          parentId: root.id,
          rank: forkRanks[i]!,
          conv: fork,
        });
      });
    };

    const emitChildren = (
      ags: AttemptGroup[],
      parentId: string,
      groupId: string | null,
    ): void => {
      const ranks = Rank.nBetween(null, null, ags.length);
      ags.forEach((ag, i) => emitAttemptGroup(ag, parentId, ranks[i]!, groupId));
    };

    for (const g of groups) {
      const ags = groupedAttemptGroups.get(g.id) ?? [];
      out.push({
        kind: "group",
        id: g.id,
        title: g.title,
        parentId: null,
        rank: rootRanks[rootIdx++]!,
        expanded: g.expanded,
        count: ags.length,
      });
      emitChildren(ags, g.id, g.id);
    }

    for (const ag of autoGroups) {
      const id = autoGroupRowId(ag.clusterKey);
      out.push({
        kind: "auto-group",
        id,
        title: ag.title,
        parentId: null,
        rank: rootRanks[rootIdx++]!,
        expanded: localExpanded[id] ?? true,
        rootConvIds: ag.rootConvIds,
      });
      emitChildren(ag.attemptGroups, id, null);
    }

    out.push({
      kind: "bucket",
      id: BUCKET_UNGROUPED,
      title: "Ungrouped",
      parentId: null,
      rank: rootRanks[rootIdx++]!,
      expanded: localExpanded[BUCKET_UNGROUPED] ?? true,
    });
    emitChildren(trulyUngrouped, BUCKET_UNGROUPED, null);

    out.push({
      kind: "bucket",
      id: BUCKET_CLOSED,
      title: "Closed",
      parentId: null,
      rank: rootRanks[rootIdx++]!,
      expanded: localExpanded[BUCKET_CLOSED] ?? true,
    });
    // The bounded `recentGone` set only — full history is the History tab's job.
    const goneRanks = Rank.nBetween(null, null, recentGone.length);
    recentGone.forEach((c, i) => {
      out.push({
        kind: "conv",
        id: c.id,
        title: c.title ?? "",
        parentId: BUCKET_CLOSED,
        rank: goneRanks[i]!,
        conv: c,
        groupId: groupIdByConvId.get(c.id) ?? null,
      });
    });

    return {
      rows: out,
      groups,
      rowById: new Map(out.map((r) => [r.id, r])),
      autoGroupSiblings,
    };
  }, [all, conv, localExpanded]);

  return { rows, groups, rowById, autoGroupSiblings, setLocalExpanded, pending };
}
