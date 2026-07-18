import { useMemo, useState } from "react";
import type { Rank } from "@plugins/primitives/plugins/rank/core";
import type { Conversation } from "@plugins/tasks/plugins/tasks-core/core";
import {
  conversationsActiveResource,
  conversationsGoneResource,
  tasksResource,
} from "@plugins/tasks/plugins/tasks-core/core";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useOptimisticResource } from "@plugins/primitives/plugins/optimistic-mutation/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import {
  queueRanksResource,
  queuePinResource,
  reorderQueue,
  type QueueData,
  type QueueRankRow,
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

/** The computed queue display — the built rows plus the resolved pin. */
type QueueDisplay = { rows: QueueRow[]; pinnedConversationId: string | null };

/**
 * Combines the queue's live resources — active + gone conversations, tasks, the
 * bounded POINT ranks (subscribed to the LIVE conversation id set, replayed
 * through the optimistic overlay), and the scalar pin — runs the shared
 * {@link classifyQueue}, and flattens the classification into one `QueueRow[]` in
 * display order (Current, Queue, Working, Unranked, Disconnected, Done).
 * Task-group members are emitted representative-first so the aggregate entry's key
 * equals the representative id (selection-highlight parity with the classic view).
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
  const pinResult = useResource(queuePinResource);

  // The live conversation id set the queue already tracks — `null` (not a fake
  // empty) while active is still pending, so a pending live set is never confused
  // with a genuinely-empty one. The all-or-nothing gate below (which includes
  // `activeResult`) keeps the whole hook pending until active settles.
  const liveIds = useMemo<string[] | null>(() => {
    if (activeResult.pending) return null;
    return activeResult.data.map((c) => c.id);
  }, [activeResult]);
  // Encode the tuple the ranks resource subscribes to. A pending live set falls
  // back to the empty tuple — a valid EMPTY point subscription (no query), never
  // surfaced because the gate stays pending until active settles. `point.encode`
  // sorts+dedupes, so the params are canonical.
  const rankParams = useMemo(
    () => queueRanksResource.point.encode(liveIds ?? []),
    [liveIds],
  );

  const ranksResult = useOptimisticResource<QueueRankRow[], ReorderVars>({
    resource: queueRanksResource,
    params: rankParams,
    apply: applyReorder,
    // Exact-ack confirmation comes from the ack channel (queue-ranks declares
    // `ackChannel: true`): a scoped/point delta carries no snapshot watermark, so
    // the reorder endpoint's returned `{ watermark }` is matched against the
    // frame's ackTx via the tx-ack registry — no isConfirmedBy needed.
    mutate: (vars) => fetchEndpoint(reorderQueue, {}, { body: vars }),
  });

  // All-or-nothing gate over the five live resources, memoized on their STABLE
  // result identities (each `useResource`/`useOptimisticResource` result is
  // referentially stable when its data/pending is unchanged). This stability is
  // load-bearing: the retain-last set-during-render below relies on `computed`
  // being a stable object between renders, so it fires only on genuine changes and
  // terminates. `null` early-returns (never a fake-empty) so a pending resource is
  // never confused with an empty one.
  const computed = useMemo<QueueDisplay | null>(() => {
    if (
      activeResult.pending ||
      goneResult.pending ||
      ranksResult.pending ||
      pinResult.pending ||
      tasksResult.pending
    ) {
      return null;
    }

    // Reassemble the client-side `QueueData` from the point ranks + scalar pin so
    // `classifyQueue` (the shared source of truth) stays UNCHANGED.
    const queue: QueueData = {
      ranks: ranksResult.data,
      pinnedConversationId: pinResult.data.pinnedConversationId,
    };
    const {
      waitingGroups,
      workingGroups,
      blockedIds,
      unranked,
      disconnected,
      recentGone,
      pinnedConversationId: pinned,
    } = classifyQueue({
      active: activeResult.data,
      gone: goneResult.data,
      queue,
      tasks: tasksResult.data,
    });

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
  }, [activeResult, goneResult, ranksResult, pinResult, tasksResult]);

  // Flash mitigation: the live-set changing re-baselines the ranks subscription
  // (a new point tuple ⇒ a pending arm). Retain the last non-pending display so a
  // re-subscription paints the previous rows instead of blanking to a skeleton.
  // This is React's sanctioned "store info from previous renders" pattern — a
  // guarded set-during-render; it terminates because `computed` is a stable
  // memoized object while the inputs are unchanged (`computed === lastGood` ⇒ no
  // set). On
  // true first mount (no retained value) `display` stays null and the hook reports
  // `pending`.
  const [lastGood, setLastGood] = useState<QueueDisplay | null>(null);
  if (computed && computed !== lastGood) setLastGood(computed);
  const display = computed ?? lastGood;

  return {
    rows: display?.rows ?? [],
    pinnedConversationId: display?.pinnedConversationId ?? null,
    dispatchReorder: ranksResult.dispatch,
    pending: display === null,
  };
}
