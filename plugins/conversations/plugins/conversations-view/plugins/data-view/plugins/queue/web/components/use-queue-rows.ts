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
  queueRanks,
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
  "pinned" | "queued" | "working" | "unranked" | "disconnected" | "done";

/**
 * One flat DataView row per conversation. Extends {@link Conversation} with the
 * section classification + the group-level queue flags (set identically on every
 * member of a task-group, so whichever member the aggregate picks as the
 * representative carries the right flags). `rank` is non-null ONLY in the
 * `pinned`/`queued` sections (drives manual-order drag); `null` everywhere else
 * marks the row non-draggable (primitive P1). `pinned` is the user's own flag and
 * is carried on EVERY section's rows, so the unpin action is reachable from
 * Working too — a pinned group that starts running comes back to Pinned when it
 * finishes.
 */
export type QueueRow = Conversation & {
  section: QueueSection;
  rank: Rank | null;
  pinned: boolean;
  isTop: boolean;
  isBottom: boolean;
  canStepDown: boolean;
  isBlocked: boolean;
  memberCount: number;
};

/**
 * The computed queue display, and the reorder that was made against it. The
 * dispatch is kept WITH the display it belongs to: while a live-set change
 * re-baselines the ranks read (pending again, for one round trip) the sidebar
 * keeps painting this display, and a drag made on it is an op against ranks
 * the user did see — so it goes through the same overlay, which replays it on
 * the new tuple's base once that lands.
 */
type QueueDisplay = {
  rows: QueueRow[];
  dispatchReorder: (vars: ReorderVars) => void;
};

/**
 * Combines the queue's live resources — active + gone conversations, tasks, and
 * the bounded POINT ranks (subscribed to the LIVE conversation id set, replayed
 * through the optimistic overlay) — runs the shared {@link classifyQueue}, and
 * flattens the classification into one `QueueRow[]` in display order (Pinned,
 * Queue, Working, Unranked, Disconnected, Done).
 * Task-group members are emitted representative-first so the aggregate entry's key
 * equals the representative id (selection-highlight parity with the classic view).
 */
export function useQueueRows(): {
  rows: QueueRow[];
  dispatchReorder: (vars: ReorderVars) => void;
  pending: boolean;
} {
  const activeResult = useResource(conversationsActiveResource);
  const goneResult = useResource(conversationsGoneResource);
  const tasksResult = useResource(tasksResource);

  // The live conversation id set the queue already tracks — `null` (not a fake
  // empty) while active is still pending, so a pending live set is never confused
  // with a genuinely-empty one. The all-or-nothing gate below (which includes
  // `activeResult`) keeps the whole hook pending until active settles.
  const liveIds = useMemo<string[] | null>(() => {
    if (activeResult.pending) return null;
    return activeResult.data.map((c) => c.id);
  }, [activeResult]);
  // The ranks of the live set, as an id set of the collection. A pending live
  // set reads the empty set — a valid EMPTY point subscription (no query), never
  // surfaced because the gate stays pending until active settles. The id set
  // is encoded canonically (sorted, deduped), so its order does not matter.
  const ranksResult = useOptimisticResource(
    queueRanks,
    { ids: liveIds ?? [] },
    {
      apply: applyReorder,
      // Exact-ack confirmation: a point delta carries no snapshot watermark, so
      // the reorder endpoint's returned `{ watermark }` is matched against the
      // frames' ackTx via the tx-ack registry — no isConfirmedBy needed. A
      // write that changes nothing in this id set is acked by a standalone
      // frame, which the hook asks the server for on its own.
      mutate: (vars: ReorderVars) =>
        fetchEndpoint(reorderQueue, {}, { body: vars }),
    },
  );

  // All-or-nothing gate over the four live resources, memoized on their STABLE
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
      tasksResult.pending
    ) {
      return null;
    }

    // Wrap the point ranks in the client-side `QueueData` shape so
    // `classifyQueue` (the shared source of truth) stays UNCHANGED.
    const queue: QueueData = { ranks: ranksResult.data };
    const {
      pinnedGroups,
      waitingGroups,
      workingGroups,
      blockedIds,
      unranked,
      disconnected,
      recentGone,
    } = classifyQueue({
      active: activeResult.data,
      gone: goneResult.data,
      queue,
      tasks: tasksResult.data,
    });

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
          pinned: m.pinned,
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
        pinned: false,
        isTop: false,
        isBottom: false,
        canStepDown: false,
        isBlocked: false,
        memberCount: 1,
      });
    };

    // 1. pinned — the waiting clusters the user pinned (rank asc). Its own rank
    // space for the top/bottom affordances: a pinned row's neighbours are the
    // other pinned rows, which is what "move to top" means while it is up there.
    pinnedGroups.forEach((group, idx) => {
      emitGroup(group, "pinned", {
        ranked: true,
        isTop: idx === 0,
        isBottom: idx === pinnedGroups.length - 1,
        canStepDown: idx < pinnedGroups.length - 1,
        isBlocked: blockedIds.has(group.selected.id),
      });
    });

    // 2. queued — the unpinned waiting clusters (rank asc).
    waitingGroups.forEach((group, idx) => {
      emitGroup(group, "queued", {
        ranked: true,
        isTop: idx === 0,
        isBottom: idx === waitingGroups.length - 1,
        canStepDown: idx < waitingGroups.length - 1,
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

    return { rows: out, dispatchReorder: ranksResult.dispatch };
  }, [activeResult, goneResult, ranksResult, tasksResult]);

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
    dispatchReorder: display?.dispatchReorder ?? noReorder,
    pending: display === null,
  };
}

// No display yet: nothing is on screen to drag, so there is nothing to reorder.
function noReorder(): void {
  throw new Error(
    "useQueueRows: a reorder was dispatched before the queue rendered",
  );
}
