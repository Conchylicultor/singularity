import { isBlockedStatus } from "@plugins/tasks/plugins/tasks-core/core";
import type {
  Conversation,
  TaskListItem,
} from "@plugins/tasks/plugins/tasks-core/core";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import type { QueueData } from "../core/resources";

/** A live conversation carrying its resolved queue rank and pin. */
export type RankedConversation = Conversation & { rank: Rank; pinned: boolean };

/** A task-group: every ranked conversation sharing a `taskId`, sharing one rank. */
export type TaskGroup = {
  taskId: string;
  selected: RankedConversation;
  members: RankedConversation[];
  count: number;
};

/** The settled classification of the queue, partitioned into read-time sections. */
export interface ClassifiedQueue {
  pinnedGroups: TaskGroup[];
  waitingGroups: TaskGroup[];
  workingGroups: TaskGroup[];
  allWaitingCount: number;
  blockedIds: Set<string>;
  unranked: Conversation[];
  disconnected: Conversation[];
  recentGone: Conversation[];
}

/**
 * Pure, React-free queue classification — the single source of truth for how
 * live conversations, their queue ranks, and their tasks partition into the
 * queue's read-time sections (Pinned / Queue / Working / Unranked / Disconnected /
 * Done), grouped by `taskId` with a shared rank per group.
 *
 * A pin only moves a WAITING group into its own section: an active group belongs
 * in Working whether or not it is pinned, since Working answers "what is running
 * right now" and the pin answers "what do I want to keep in reach".
 *
 * Kept free of React and of the DataView so the partitioning stays testable and
 * reusable by any presentation of the queue.
 */
export function classifyQueue(data: {
  active: Conversation[];
  gone: Conversation[];
  queue: QueueData;
  tasks: TaskListItem[];
}): ClassifiedQueue {
  const { active, gone, queue, tasks } = data;
  const ranks = new Map(queue.ranks.map((r) => [r.conversationId, r]));
  const taskStatusMap = new Map(tasks.map((t) => [t.id, t.status]));
  const ranked: RankedConversation[] = [];
  const blocked = new Set<string>();
  const noRank: Conversation[] = [];

  for (const c of active) {
    if (
      c.status !== "waiting" &&
      c.status !== "working" &&
      c.status !== "starting"
    )
      continue;
    // A live conversation's task reports the RUNNING half of blocked
    // (`in_progress_blocked`), so this must ask the predicate — matching the
    // `"blocked"` literal alone would mark nothing here.
    const taskStatus = taskStatusMap.get(c.taskId);
    if (taskStatus !== undefined && isBlockedStatus(taskStatus)) {
      blocked.add(c.id);
    }
    const row = ranks.get(c.id);
    if (row) {
      ranked.push({ ...c, rank: row.rank, pinned: row.pinned });
    } else if (c.status === "waiting") {
      noRank.push(c);
    }
  }
  ranked.sort((a, b) => Rank.compare(a.rank, b.rank));

  // Group by taskId
  const taskMap = new Map<string, RankedConversation[]>();
  for (const conv of ranked) {
    const list = taskMap.get(conv.taskId);
    if (list) list.push(conv);
    else taskMap.set(conv.taskId, [conv]);
  }

  const pinnedWaiting: TaskGroup[] = [];
  const waiting: TaskGroup[] = [];
  const working: TaskGroup[] = [];
  let waitingCount = 0;
  for (const [taskId, members] of taskMap) {
    if (members.length === 0) continue;
    const workingMember = members.find(
      (m) => m.status === "working" || m.status === "starting",
    );
    const mostRecent = members.reduce((a, b) =>
      b.createdAt > a.createdAt ? b : a,
    );
    const selected = workingMember ?? mostRecent;
    const group: TaskGroup = {
      taskId,
      selected,
      members,
      count: members.length,
    };
    if (workingMember) {
      working.push(group);
    } else {
      // The pin is written to every live member of a group, so any member
      // answers for the group.
      (selected.pinned ? pinnedWaiting : waiting).push(group);
      waitingCount += members.filter((m) => m.status === "waiting").length;
    }
  }
  const byRank = (a: TaskGroup, b: TaskGroup): number =>
    Rank.compare(a.selected.rank, b.selected.rank);
  pinnedWaiting.sort(byRank);
  waiting.sort(byRank);
  working.sort(byRank);

  return {
    pinnedGroups: pinnedWaiting,
    waitingGroups: waiting,
    workingGroups: working,
    allWaitingCount: waitingCount,
    blockedIds: blocked,
    unranked: noRank,
    disconnected: active.filter((c) => c.status === "gone"),
    recentGone: gone,
  };
}
