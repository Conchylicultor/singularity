import { useMemo } from "react";
import type { Rank } from "@plugins/primitives/plugins/rank/core";
import type { Conversation } from "@plugins/tasks/plugins/tasks-core/core";
import {
  conversationsActiveResource,
  conversationsGoneResource,
  tasksResource,
} from "@plugins/tasks/plugins/tasks-core/core";
import { useResource, useCombinedResources } from "@plugins/primitives/plugins/live-state/web";
import { useOptimisticResource } from "@plugins/primitives/plugins/optimistic-mutation/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import {
  queueRanksResource,
  reorderQueue,
  type QueueData,
} from "@plugins/conversations/plugins/conversations-view/plugins/queue/core";
import {
  applyReorder,
  classifyQueue,
  type ReorderVars,
  type TaskGroup,
} from "@plugins/conversations/plugins/conversations-view/plugins/queue/web";

/** The read-time section a queue row belongs to (the enum the `section` field partitions by). */
export type QueueSection =
  | "current"
  | "queued"
  | "working"
  | "unranked"
  | "disconnected"
  | "done";

/**
 * One flat DataView row per conversation. Extends {@link Conversation} with the
 * section classification + the group-level queue flags (set identically on every
 * member of a task-group, so whichever member the aggregate picks as the
 * representative carries the right flags). `rank` is non-null ONLY in the
 * `current`/`queued` sections (drives manual-order drag); `null` everywhere else
 * marks the row non-draggable (primitive P1).
 */
export type QueueRow = Conversation & {
  section: QueueSection;
  rank: Rank | null;
  isTop: boolean;
  isBottom: boolean;
  canStepDown: boolean;
  isBlocked: boolean;
  memberCount: number;
};

/**
 * Combines the queue's live resources (active + gone conversations, tasks, and
 * the optimistic queue ranks), runs the shared {@link classifyQueue}, and flattens
 * the classification into one `QueueRow[]` in display order — the exact section
 * sequence the `section` group-by renders (Current, Queue, Working, Unranked,
 * Disconnected, Done). Task-group members are emitted representative-first so the
 * aggregate entry's key equals the representative id (selection-highlight parity
 * with the classic view).
 */
export function useQueueRows(): {
  rows: QueueRow[];
  pinnedConversationId: string | null;
  dispatchReorder: (vars: ReorderVars) => void;
  pending: boolean;
} {
  const activeResult = useResource(conversationsActiveResource);
  const goneResult = useResource(conversationsGoneResource);
  const tasksResult = useResource(tasksResource);
  const queueResult = useOptimisticResource<QueueData, ReorderVars>({
    resource: queueRanksResource,
    apply: applyReorder,
    mutate: (vars) => fetchEndpoint(reorderQueue, {}, { body: vars }),
  });
  const all = useCombinedResources({
    active: activeResult,
    gone: goneResult,
    queue: queueResult,
    tasks: tasksResult,
  });

  const { rows, pinnedConversationId } = useMemo<{
    rows: QueueRow[];
    pinnedConversationId: string | null;
  }>(() => {
    if (all.pending) return { rows: [], pinnedConversationId: null };

    const {
      waitingGroups,
      workingGroups,
      blockedIds,
      unranked,
      disconnected,
      recentGone,
      pinnedConversationId: pinned,
    } = classifyQueue(all.data);

    const pinnedCluster =
      (pinned &&
        waitingGroups.find((g) => g.members.some((m) => m.id === pinned))) ||
      null;
    const restClusters = pinnedCluster
      ? waitingGroups.filter((g) => g !== pinnedCluster)
      : waitingGroups;

    const out: QueueRow[] = [];

    // Representative first, then the remaining members — so the aggregate entry's
    // key equals the representative id. Group-level flags apply to every member.
    const emitGroup = (
      group: TaskGroup,
      section: QueueSection,
      flags: {
        ranked: boolean;
        isTop: boolean;
        isBottom: boolean;
        canStepDown: boolean;
        isBlocked: boolean;
      },
    ): void => {
      const ordered = [
        group.selected,
        ...group.members.filter((m) => m.id !== group.selected.id),
      ];
      for (const m of ordered) {
        out.push({
          ...m,
          section,
          rank: flags.ranked ? m.rank : null,
          isTop: flags.isTop,
          isBottom: flags.isBottom,
          canStepDown: flags.canStepDown,
          isBlocked: flags.isBlocked,
          memberCount: group.count,
        });
      }
    };

    const emitFlat = (conv: Conversation, section: QueueSection): void => {
      out.push({
        ...conv,
        section,
        rank: null,
        isTop: false,
        isBottom: false,
        canStepDown: false,
        isBlocked: false,
        memberCount: 1,
      });
    };

    // 1. current — the pinned cluster (if any).
    if (pinnedCluster) {
      emitGroup(pinnedCluster, "current", {
        ranked: true,
        isTop: true,
        isBottom: restClusters.length === 0,
        canStepDown: restClusters.length > 0,
        isBlocked: blockedIds.has(pinnedCluster.selected.id),
      });
    }

    // 2. queued — the remaining waiting clusters (rank asc).
    restClusters.forEach((group, idx) => {
      emitGroup(group, "queued", {
        ranked: true,
        isTop: false,
        isBottom: idx === restClusters.length - 1,
        canStepDown: idx < restClusters.length - 1,
        isBlocked: blockedIds.has(group.selected.id),
      });
    });

    // 3. working — non-draggable (rank null).
    for (const group of workingGroups) {
      emitGroup(group, "working", {
        ranked: false,
        isTop: false,
        isBottom: false,
        canStepDown: false,
        isBlocked: false,
      });
    }

    // 4–6. flat sections (keep incoming order).
    for (const conv of unranked) emitFlat(conv, "unranked");
    for (const conv of disconnected) emitFlat(conv, "disconnected");
    for (const conv of recentGone) emitFlat(conv, "done");

    return { rows: out, pinnedConversationId: pinned };
  }, [all]);

  return {
    rows,
    pinnedConversationId,
    dispatchReorder: queueResult.dispatch,
    pending: all.pending,
  };
}
