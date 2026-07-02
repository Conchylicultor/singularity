import type { Conversation, TaskListItem } from "@plugins/tasks/plugins/tasks-core/core";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import type { QueueData } from "../core/resources";

/** A live conversation carrying its resolved queue rank. */
export type RankedConversation = Conversation & { rank: Rank };

/** A task-group: every ranked conversation sharing a `taskId`, sharing one rank. */
export type TaskGroup = {
  taskId: string;
  selected: RankedConversation;
  members: RankedConversation[];
  count: number;
};

/** The settled classification of the queue, partitioned into read-time sections. */
export interface ClassifiedQueue {
  waitingGroups: TaskGroup[];
  workingGroups: TaskGroup[];
  allWaitingCount: number;
  blockedIds: Set<string>;
  unranked: Conversation[];
  disconnected: Conversation[];
  recentGone: Conversation[];
  pinnedConversationId: string | null;
}

/**
 * Pure, React-free queue classification — the single source of truth for how
 * live conversations, their queue ranks, and their tasks partition into the
 * queue's read-time sections (Queue / Working / Unranked / Disconnected / Done),
 * grouped by `taskId` with a shared rank per group.
 *
 * Shared verbatim by the bespoke {@link QueueView} (classic sidebar variant) and
 * the DataView-based Queue tab, so the two presentations can never drift.
 */
export function classifyQueue(data: {
  active: Conversation[];
  gone: Conversation[];
  queue: QueueData;
  tasks: TaskListItem[];
}): ClassifiedQueue {
  const { active, gone, queue, tasks } = data;
  const ranks = new Map(queue.ranks.map((r) => [r.conversationId, r.rank]));
  const taskStatusMap = new Map(tasks.map((t) => [t.id, t.status]));
  const ranked: RankedConversation[] = [];
  const blocked = new Set<string>();
  const noRank: Conversation[] = [];

  for (const c of active) {
    if (c.status !== "waiting" && c.status !== "working" && c.status !== "starting") continue;
    if (taskStatusMap.get(c.taskId) === "blocked") {
      blocked.add(c.id);
    }
    const rank = ranks.get(c.id);
    if (rank) {
      ranked.push({ ...c, rank });
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

  const waiting: TaskGroup[] = [];
  const working: TaskGroup[] = [];
  let waitingCount = 0;
  for (const [taskId, members] of taskMap) {
    if (members.length === 0) continue;
    const workingMember = members.find((m) => m.status === "working" || m.status === "starting");
    const mostRecent = members.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
    const selected = workingMember ?? mostRecent;
    const group: TaskGroup = { taskId, selected, members, count: members.length };
    if (workingMember) {
      working.push(group);
    } else {
      waiting.push(group);
      waitingCount += members.filter((m) => m.status === "waiting").length;
    }
  }
  waiting.sort((a, b) => Rank.compare(a.selected.rank, b.selected.rank));
  working.sort((a, b) => Rank.compare(a.selected.rank, b.selected.rank));

  return {
    waitingGroups: waiting,
    workingGroups: working,
    allWaitingCount: waitingCount,
    blockedIds: blocked,
    unranked: noRank,
    disconnected: active.filter((c) => c.status === "gone"),
    recentGone: gone,
    pinnedConversationId: queue.pinnedConversationId,
  };
}
