import { implement } from "@plugins/infra/plugins/endpoints/server";
import { getPushProfiling } from "../../shared/endpoints";
import { readContentionRecords } from "./read-contention";
import { readBuildLogRecords } from "./read-build-log";

interface PushEntry {
  pushId: string;
  branch: string;
  outcome: string;
  startedAt: string;
  startMs: number;
  waitMs: number;
  holdMs: number;
  conversationId: string | null;
}

interface BuildEntry {
  worktree: string;
  startMs: number;
  durationMs: number;
  success: boolean;
  crashed: boolean;
}

interface WorktreeGroup {
  worktree: string;
  pushes: PushEntry[];
  builds: BuildEntry[];
}

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
const TWENTY_MINUTES = 20 * 60 * 1000;

function matchesWorktree(wt: string, target: string): boolean {
  return wt === target || wt === `claude-web/${target}` || wt.endsWith(`/${target}`);
}

function computeWorktreeWindow(
  allPushRecords: ReturnType<typeof readContentionRecords>,
  allBuildRecords: ReturnType<typeof readBuildLogRecords>,
  worktree: string,
  padding: number,
): { cutoffStart: number; cutoffEnd: number } | null {
  const timestamps: number[] = [];

  for (const r of allPushRecords) {
    const wt = r.worktree ?? r.branch;
    if (!matchesWorktree(wt, worktree)) continue;
    const start = new Date(r.lockRequestedAt).getTime();
    timestamps.push(start, start + r.waitMs + r.holdMs);
  }

  for (const r of allBuildRecords) {
    if (!matchesWorktree(r.worktree, worktree)) continue;
    const start = new Date(r.startedAt).getTime();
    timestamps.push(start, start + r.totalMs);
  }

  if (timestamps.length === 0) return null;

  const min = Math.min(...timestamps);
  const max = Math.max(...timestamps);
  return { cutoffStart: min - padding, cutoffEnd: max + padding };
}

export const handlePushProfiling = implement(
  getPushProfiling,
  ({ query }) => {
    const allPushRecords = readContentionRecords();
    const allBuildRecords = readBuildLogRecords();

    let recentPushes: typeof allPushRecords;
    let recentBuilds: typeof allBuildRecords;

    if (query.worktree) {
      const padding = query.padding ?? TWENTY_MINUTES;
      const window = computeWorktreeWindow(
        allPushRecords,
        allBuildRecords,
        query.worktree,
        padding,
      );
      if (!window) return { groups: [], totalMs: 0 };

      recentPushes = allPushRecords.filter((r) => {
        const start = new Date(r.lockRequestedAt).getTime();
        const end = start + r.waitMs + r.holdMs;
        return end >= window.cutoffStart && start <= window.cutoffEnd;
      });
      recentBuilds = allBuildRecords.filter((r) => {
        const start = new Date(r.startedAt).getTime();
        const end = start + r.totalMs;
        return end >= window.cutoffStart && start <= window.cutoffEnd;
      });
    } else {
      const sinceMs = query.since ?? TWENTY_FOUR_HOURS;
      const cutoff = Date.now() - sinceMs;
      recentPushes = allPushRecords.filter(
        (r) => new Date(r.startedAt).getTime() >= cutoff,
      );
      recentBuilds = allBuildRecords.filter(
        (r) => new Date(r.startedAt).getTime() >= cutoff,
      );
    }

    recentPushes.sort(
      (a, b) =>
        new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
    );

    if (recentPushes.length === 0 && recentBuilds.length === 0) {
      return { groups: [], totalMs: 0 };
    }

    const pushTimestamps = recentPushes.map((r) =>
      new Date(r.lockRequestedAt).getTime(),
    );
    const buildStartTimestamps = recentBuilds.map((r) =>
      new Date(r.startedAt).getTime(),
    );
    const originMs = Math.min(
      ...[...pushTimestamps, ...buildStartTimestamps],
    );

    const byWorktree = new Map<
      string,
      { pushes: PushEntry[]; builds: BuildEntry[] }
    >();

    const getGroup = (wt: string) => {
      let group = byWorktree.get(wt);
      if (!group) {
        group = { pushes: [], builds: [] };
        byWorktree.set(wt, group);
      }
      return group;
    };

    for (const record of recentPushes) {
      const wt = record.worktree ?? record.branch;
      const pushOffset =
        new Date(record.lockRequestedAt).getTime() - originMs;

      getGroup(wt).pushes.push({
        pushId: record.pushId,
        branch: record.branch,
        outcome: record.outcome,
        startedAt: record.startedAt,
        startMs: pushOffset,
        waitMs: record.waitMs,
        holdMs: record.holdMs,
        conversationId: record.conversationId,
      });
    }

    for (const record of recentBuilds) {
      const wt = record.worktree;
      const buildOffset = new Date(record.startedAt).getTime() - originMs;

      getGroup(wt).builds.push({
        worktree: record.worktree,
        startMs: buildOffset,
        durationMs: record.totalMs,
        success: record.success,
        crashed: record.crashed,
      });
    }

    const groups: WorktreeGroup[] = [];
    for (const [worktree, data] of byWorktree) {
      groups.push({ worktree, pushes: data.pushes, builds: data.builds });
    }

    const pushEnds = recentPushes.map((r) => {
      const pushOffset =
        new Date(r.lockRequestedAt).getTime() - originMs;
      return pushOffset + r.waitMs + r.holdMs;
    });
    const buildEnds = recentBuilds.map(
      (r) => new Date(r.startedAt).getTime() - originMs + r.totalMs,
    );
    const totalMs = Math.max(0, ...[...pushEnds, ...buildEnds]);

    return { groups, totalMs };
  },
);
