import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SINGULARITY_DIR } from "@plugins/infra/plugins/paths/server";

interface RawBuildLogRecord {
  phase?: "started" | "completed";
  worktree: string;
  branch: string;
  buildId?: string | null;
  startedAt: string;
  completedAt: string | null;
  totalMs: number;
  success: boolean;
  /**
   * Set on terminal records written by the orphan reconciler
   * (finalizeOrphanedBuilds): the matching build was hard-killed, so it has no
   * real end. Distinguishes a reconciled-interrupted close from an ordinary
   * `completed` close. Absent on CLI-written records.
   */
  interrupted?: boolean;
}

export interface BuildLogRecord {
  worktree: string;
  branch: string;
  buildId: string | null;
  startedAt: string;
  completedAt: string | null;
  totalMs: number;
  success: boolean;
  /**
   * True for builds hard-killed before any graceful exit (SIGKILL, OOM, power
   * loss) — these have no known end time. They carry no real duration, so
   * `totalMs` is 0 and the Gantt renders them as a fixed-width interrupted
   * marker at their start rather than a bar. Ordinary build failures write a
   * `completed` record with `success: false` and a real duration (see build.ts
   * finalizeBuildLog).
   */
  interrupted: boolean;
}

const BUILD_LOG_FILE = join(SINGULARITY_DIR, "build-log.jsonl");

function readRawRecords(): RawBuildLogRecord[] {
  let raw: string;
  try {
    raw = readFileSync(BUILD_LOG_FILE, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    return [];
  }

  const rawRecords: RawBuildLogRecord[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      rawRecords.push(JSON.parse(trimmed) as RawBuildLogRecord);
    } catch (err) {
      if (err instanceof SyntaxError) continue;
      throw err;
    }
  }
  return rawRecords;
}

// Started records with no matching terminal record, keyed by (worktree,
// startedAt). Records without a phase field are legacy "completed" records
// (pre-crash-tracking) and close their pair like any terminal record.
function findOrphanedStarts(raw: RawBuildLogRecord[]): RawBuildLogRecord[] {
  const pending = new Map<string, RawBuildLogRecord>();
  for (const r of raw) {
    const key = `${r.worktree}:${r.startedAt}`;
    if (r.phase === "started") pending.set(key, r);
    else pending.delete(key);
  }
  return [...pending.values()];
}

export function readBuildLogRecords(): BuildLogRecord[] {
  const raw = readRawRecords();

  // Merge start/completed pairs by (worktree, startedAt). A terminal record
  // (completed or legacy no-phase) emits a merged entry; its `interrupted`
  // flag, if present, was set by the reconciler. Unmatched "started" entries
  // are builds hard-killed before any graceful exit — end time unknown, so
  // duration is 0 and they render as interrupted markers.
  const pending = new Map<string, RawBuildLogRecord>();
  const merged: BuildLogRecord[] = [];

  for (const r of raw) {
    const key = `${r.worktree}:${r.startedAt}`;

    if (r.phase === "started") {
      pending.set(key, r);
    } else {
      pending.delete(key);
      merged.push({
        worktree: r.worktree,
        branch: r.branch,
        buildId: r.buildId ?? null,
        startedAt: r.startedAt,
        completedAt: r.completedAt,
        totalMs: r.totalMs,
        success: r.success,
        interrupted: r.interrupted ?? false,
      });
    }
  }

  // Any remaining pending entries are interrupted builds not yet reconciled.
  for (const r of pending.values()) {
    merged.push({
      worktree: r.worktree,
      branch: r.branch,
      buildId: r.buildId ?? null,
      startedAt: r.startedAt,
      completedAt: null,
      totalMs: 0,
      success: false,
      interrupted: true,
    });
  }

  return merged;
}

/**
 * Close out orphaned "started" records by appending a terminal interrupted
 * record for each — the build-log analogue of the `build_runs` orphan
 * reconciler in @plugins/build/server. A hard kill (SIGKILL/OOM/power loss)
 * can't run the CLI's finalizeBuildLog, so it leaves a "started" with no
 * "completed"; this stamps a real terminal record so the entry stops being
 * recomputed as open on every read while preserving it as an interrupted
 * trace. `isActive(worktree)` guards against closing a build that is still
 * genuinely running. Appends (never rewrites) to stay safe against concurrent
 * CLI writes — callers must ensure a single writer (gate on the main backend).
 * Returns the number of records finalized.
 */
export async function finalizeOrphanedBuilds(
  isActive: (worktree: string) => Promise<boolean>,
): Promise<number> {
  const orphans = findOrphanedStarts(readRawRecords());
  let finalized = 0;
  for (const o of orphans) {
    if (await isActive(o.worktree)) continue;
    const record: RawBuildLogRecord = {
      phase: "completed",
      worktree: o.worktree,
      branch: o.branch,
      buildId: o.buildId ?? null,
      startedAt: o.startedAt,
      completedAt: null,
      totalMs: 0,
      success: false,
      interrupted: true,
    };
    appendFileSync(BUILD_LOG_FILE, JSON.stringify(record) + "\n");
    finalized++;
  }
  return finalized;
}
