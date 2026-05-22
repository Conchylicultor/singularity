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

export const handlePushProfiling = implement(
  getPushProfiling,
  () => {
    const cutoff = Date.now() - TWENTY_FOUR_HOURS;

    const allPushRecords = readContentionRecords();
    const recentPushes = allPushRecords
      .filter((r) => new Date(r.startedAt).getTime() >= cutoff)
      .sort(
        (a, b) =>
          new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
      );

    const allBuildRecords = readBuildLogRecords();
    const recentBuilds = allBuildRecords.filter(
      (r) => new Date(r.startedAt).getTime() >= cutoff,
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
      const wt = record.branch;
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
      });
    }

    for (const record of recentBuilds) {
      const wt = record.branch;
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
