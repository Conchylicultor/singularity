import type { OpRecord } from "@plugins/debug/plugins/profiling/plugins/op-log/core";
import { readOpRecords } from "@plugins/debug/plugins/profiling/plugins/op-log/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { getOpProfiling, type OpEntry, type WorktreeGroup } from "../../shared/endpoints";
import { resolveWorktreeTitles } from "./resolve-worktree-titles";

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
const TWENTY_MINUTES = 20 * 60 * 1000;

function matchesWorktree(wt: string, target: string): boolean {
  return wt === target || wt === `claude-web/${target}` || wt.endsWith(`/${target}`);
}

// Ops for the same worktree carry different identifiers: builds log the basename
// (`att-x`), while pushes fall back to the branch (`claude-web/att-x`) whenever
// SINGULARITY_WORKTREE is unset for the push CLI. Canonicalize every kind to the
// bare worktree basename so a worktree's push, build, and check bars group onto
// a single Gantt row instead of several.
function canonicalWorktree(wt: string): string {
  return wt.split("/").pop() || wt;
}

/** The identifier an op is filed under, before canonicalization. */
function worktreeOf(r: OpRecord): string {
  return r.worktree ?? r.branch;
}

// An op's span on the Gantt is `requestedAt → requestedAt + totalMs`, for EVERY
// kind. `totalMs` is the full span — the waits, the real work between them, and
// the final hold — so it must NOT be reconstructed as `waitMs + holdMs`: waits
// interleave with work (a build does migrations and codegen between releasing
// the build lock and queueing for the host grant), and that sum would silently
// truncate the time axis by every gap.
function startMsOf(r: OpRecord): number {
  return new Date(r.requestedAt).getTime();
}

function endMsOf(r: OpRecord): number {
  return startMsOf(r) + r.totalMs;
}

function computeWorktreeWindow(
  allRecords: OpRecord[],
  worktree: string,
  padding: number,
): { cutoffStart: number; cutoffEnd: number } | null {
  const timestamps: number[] = [];
  for (const r of allRecords) {
    if (!matchesWorktree(worktreeOf(r), worktree)) continue;
    timestamps.push(startMsOf(r), endMsOf(r));
  }
  if (timestamps.length === 0) return null;

  return {
    cutoffStart: Math.min(...timestamps) - padding,
    cutoffEnd: Math.max(...timestamps) + padding,
  };
}

export const handleOpProfiling = implement(getOpProfiling, async ({ query }) => {
  const allRecords = readOpRecords();

  let recent: OpRecord[];
  if (query.worktree) {
    const padding = query.padding ?? TWENTY_MINUTES;
    const window = computeWorktreeWindow(allRecords, query.worktree, padding);
    if (!window) return { groups: [], totalMs: 0 };

    recent = allRecords.filter(
      (r) => endMsOf(r) >= window.cutoffStart && startMsOf(r) <= window.cutoffEnd,
    );
  } else {
    const sinceMs = query.since ?? TWENTY_FOUR_HOURS;
    const cutoff = Date.now() - sinceMs;
    recent = allRecords.filter((r) => startMsOf(r) >= cutoff);
  }

  if (recent.length === 0) return { groups: [], totalMs: 0 };

  recent.sort((a, b) => startMsOf(a) - startMsOf(b));

  const originMs = startMsOf(recent[0]!);

  const byWorktree = new Map<string, OpEntry[]>();
  for (const r of recent) {
    const wt = canonicalWorktree(worktreeOf(r));
    let ops = byWorktree.get(wt);
    if (!ops) {
      ops = [];
      byWorktree.set(wt, ops);
    }
    ops.push({
      opId: r.opId,
      kind: r.kind,
      startMs: startMsOf(r) - originMs,
      totalMs: r.totalMs,
      waits: r.waits,
      holdMs: r.holdMs,
      outcome: r.outcome,
      interrupted: r.interrupted,
      branch: r.branch,
      buildId: r.buildId,
      conversationId: r.conversationId,
      lane: r.lane,
    });
  }

  // Each worktree's label reads as the human title of the task that drove it.
  // The worktree id is the attempt id (basename invariant), and every attempt
  // has a NOT-NULL task title — so resolve the label directly from the
  // worktree id. This attributes build-only rows too (builds carry no
  // conversationId) and prefers the stable task title over a per-conversation
  // one. The conversationId is still derived per row, purely as the row-click
  // navigation target into the conversation that ran the work.
  const titles = await resolveWorktreeTitles([...byWorktree.keys()]);

  const groups: WorktreeGroup[] = [];
  for (const [worktree, ops] of byWorktree) {
    // Ops are appended chronologically, so the first one carrying a
    // conversationId is the first conversation that added an event.
    const conversationId = ops.find((o) => o.conversationId != null)?.conversationId ?? null;
    groups.push({
      worktree,
      conversationId,
      title: titles.get(worktree) ?? null,
      ops,
    });
  }

  const totalMs = Math.max(0, ...recent.map((r) => endMsOf(r) - originMs));

  return { groups, totalMs };
});
