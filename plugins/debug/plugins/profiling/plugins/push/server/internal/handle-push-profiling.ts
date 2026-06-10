import { implement } from "@plugins/infra/plugins/endpoints/server";
import { getPushProfiling } from "../../shared/endpoints";
import { readContentionRecords } from "./read-contention";
import { readBuildLogRecords } from "./read-build-log";
import { resolveConversationTitles } from "./resolve-conversation-titles";

interface PushEntry {
  pushId: string;
  branch: string;
  outcome: string;
  startedAt: string;
  startMs: number;
  waitMs: number;
  holdMs: number;
  conversationId: string | null;
  interrupted: boolean;
}

interface BuildEntry {
  worktree: string;
  buildId: string | null;
  startMs: number;
  durationMs: number;
  success: boolean;
  interrupted: boolean;
}

interface WorktreeGroup {
  worktree: string;
  conversationId: string | null;
  title: string | null;
  pushes: PushEntry[];
  builds: BuildEntry[];
}

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
const TWENTY_MINUTES = 20 * 60 * 1000;

function matchesWorktree(wt: string, target: string): boolean {
  return wt === target || wt === `claude-web/${target}` || wt.endsWith(`/${target}`);
}

// Pushes and builds for the same worktree carry different identifiers: builds
// log the basename (`att-x`), while pushes fall back to the branch
// (`claude-web/att-x`) whenever SINGULARITY_WORKTREE is unset for the push CLI.
// Canonicalize both to the bare worktree basename so a worktree's push and build
// bars group onto a single Gantt row instead of two separate ones.
function canonicalWorktree(wt: string): string {
  return wt.split("/").pop() || wt;
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
  async ({ query }) => {
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
      const wt = canonicalWorktree(record.worktree ?? record.branch);
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
        interrupted: record.interrupted,
      });
    }

    for (const record of recentBuilds) {
      const wt = canonicalWorktree(record.worktree);
      const buildOffset = new Date(record.startedAt).getTime() - originMs;

      getGroup(wt).builds.push({
        worktree: record.worktree,
        buildId: record.buildId,
        startMs: buildOffset,
        durationMs: record.totalMs,
        success: record.success,
        interrupted: record.interrupted,
      });
    }

    // Each worktree's label should read as the human title of the conversation
    // that drove it. Pushes are appended in chronological order, so the first
    // push carrying a conversationId is "the first conversation that added an
    // event". (Builds carry no conversationId, so only pushes attribute a row.)
    const byWorktreeConvId = new Map<string, string | null>();
    for (const [worktree, data] of byWorktree) {
      const firstWithConv = data.pushes.find((p) => p.conversationId != null);
      byWorktreeConvId.set(worktree, firstWithConv?.conversationId ?? null);
    }

    const titles = await resolveConversationTitles(
      [...byWorktreeConvId.values()].filter((id): id is string => id != null),
    );

    const groups: WorktreeGroup[] = [];
    for (const [worktree, data] of byWorktree) {
      const conversationId = byWorktreeConvId.get(worktree) ?? null;
      groups.push({
        worktree,
        conversationId,
        title: conversationId ? (titles.get(conversationId) ?? null) : null,
        pushes: data.pushes,
        builds: data.builds,
      });
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
