import { implement } from "@plugins/infra/plugins/endpoints/server";
import { getPushProfiling } from "../../shared/endpoints";
import { readContentionRecords } from "./read-contention";

interface PushEntry {
  pushId: string;
  branch: string;
  outcome: string;
  startedAt: string;
  startMs: number;
  waitMs: number;
  holdMs: number;
}

interface WorktreeGroup {
  worktree: string;
  pushes: PushEntry[];
}

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

export const handlePushProfiling = implement(
  getPushProfiling,
  () => {
    const allRecords = readContentionRecords();

    const cutoff = Date.now() - TWENTY_FOUR_HOURS;
    const recent = allRecords.filter(
      (r) => new Date(r.startedAt).getTime() >= cutoff,
    );

    recent.sort(
      (a, b) =>
        new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
    );

    if (recent.length === 0) {
      return { groups: [], totalMs: 0 };
    }

    const originMs = Math.min(
      ...recent.map((r) => new Date(r.lockRequestedAt).getTime()),
    );

    const byWorktree = new Map<string, PushEntry[]>();
    for (const record of recent) {
      const wt = record.branch;
      const pushOffset =
        new Date(record.lockRequestedAt).getTime() - originMs;

      const entry: PushEntry = {
        pushId: record.pushId,
        branch: record.branch,
        outcome: record.outcome,
        startedAt: record.startedAt,
        startMs: pushOffset,
        waitMs: record.waitMs,
        holdMs: record.holdMs,
      };

      const list = byWorktree.get(wt) ?? [];
      list.push(entry);
      byWorktree.set(wt, list);
    }

    const groups: WorktreeGroup[] = [];
    for (const [worktree, pushes] of byWorktree) {
      groups.push({ worktree, pushes });
    }

    const totalMs = Math.max(
      ...recent.map((r) => {
        const pushOffset =
          new Date(r.lockRequestedAt).getTime() - originMs;
        return pushOffset + r.waitMs + r.holdMs;
      }),
    );

    return { groups, totalMs };
  },
);
