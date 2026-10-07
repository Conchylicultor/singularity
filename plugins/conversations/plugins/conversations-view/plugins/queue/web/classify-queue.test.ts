import { describe, expect, test } from "bun:test";
import {
  ADOPTED_SPAWNED_BY,
  type Conversation,
} from "@plugins/tasks/plugins/tasks-core/core";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import type { QueueData } from "../core";
import { classifyQueue } from "./classify-queue";

const conv = (o: Partial<Conversation> & { id: string }): Conversation =>
  ({
    status: "waiting",
    taskId: `task-${o.id}`,
    spawnedBy: "singularity",
    createdAt: new Date(0),
    ...o,
  }) as Conversation;

const rankRow = (conversationId: string): QueueData["ranks"][number] =>
  ({
    conversationId,
    rank: Rank.between(null, null),
    pinned: false,
  }) as QueueData["ranks"][number];

describe("classifyQueue — Lost", () => {
  test("adopted live conversations are Lost, whatever their rank or status", () => {
    const launched = conv({ id: "conv-1" });
    const lostWaiting = conv({ id: "spike-a", spawnedBy: ADOPTED_SPAWNED_BY });
    const lostWorking = conv({
      id: "spike-b",
      status: "working",
      spawnedBy: ADOPTED_SPAWNED_BY,
    });
    const q = classifyQueue({
      active: [launched, lostWaiting, lostWorking],
      gone: [],
      // An adopted conversation seeded before Lost existed still has a rank.
      queue: { ranks: [rankRow("conv-1"), rankRow("spike-a")] },
      tasks: [],
    });
    expect(q.lost.map((c) => c.id)).toEqual(["spike-a", "spike-b"]);
    expect(q.waitingGroups.map((g) => g.selected.id)).toEqual(["conv-1"]);
    expect(q.workingGroups).toEqual([]);
    expect(q.workingUnranked).toEqual([]);
    expect(q.unranked).toEqual([]);
  });

  test("a closed adopted conversation is not Lost", () => {
    const q = classifyQueue({
      active: [
        conv({ id: "spike-a", status: "gone", spawnedBy: ADOPTED_SPAWNED_BY }),
      ],
      gone: [],
      queue: { ranks: [] },
      tasks: [],
    });
    expect(q.lost).toEqual([]);
    expect(q.disconnected.map((c) => c.id)).toEqual(["spike-a"]);
  });
});
