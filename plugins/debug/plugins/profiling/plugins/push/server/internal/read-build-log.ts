import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SINGULARITY_DIR } from "@plugins/infra/plugins/paths/server";

interface RawBuildLogRecord {
  phase?: "started" | "completed";
  worktree: string;
  branch: string;
  startedAt: string;
  completedAt: string | null;
  totalMs: number;
  success: boolean;
}

export interface BuildLogRecord {
  worktree: string;
  branch: string;
  startedAt: string;
  completedAt: string | null;
  totalMs: number;
  success: boolean;
  /**
   * True only for builds hard-killed before any graceful exit (SIGKILL, OOM,
   * power loss) — these leave a "started" with no "completed" and have no
   * known end time. Ordinary build failures now write a "completed" record
   * with `success: false` and a real duration (see build.ts finalizeBuildLog).
   */
  interrupted: boolean;
}

const BUILD_LOG_FILE = join(SINGULARITY_DIR, "build-log.jsonl");

export function readBuildLogRecords(): BuildLogRecord[] {
  let raw: string;
  try {
    raw = readFileSync(BUILD_LOG_FILE, "utf-8");
  } catch {
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

  // Records without a phase field are legacy "completed" records (pre-crash-tracking).
  // Merge start/completed pairs by (worktree, startedAt). Unmatched "started"
  // entries are builds hard-killed before any graceful exit — end time is
  // unknown, so estimate duration as now minus startedAt.
  const pending = new Map<string, RawBuildLogRecord>();
  const merged: BuildLogRecord[] = [];

  for (const r of rawRecords) {
    const key = `${r.worktree}:${r.startedAt}`;

    if (r.phase === "started") {
      pending.set(key, r);
    } else {
      // "completed" or legacy (no phase)
      pending.delete(key);
      merged.push({
        worktree: r.worktree,
        branch: r.branch,
        startedAt: r.startedAt,
        completedAt: r.completedAt,
        totalMs: r.totalMs,
        success: r.success,
        interrupted: false,
      });
    }
  }

  // Any remaining pending entries are interrupted builds (hard-killed)
  const nowMs = Date.now();
  for (const r of pending.values()) {
    const startMs = new Date(r.startedAt).getTime();
    merged.push({
      worktree: r.worktree,
      branch: r.branch,
      startedAt: r.startedAt,
      completedAt: null,
      totalMs: nowMs - startMs,
      success: false,
      interrupted: true,
    });
  }

  return merged;
}
