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
  crashed: boolean;
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
  // entries are crashed builds — estimate duration as now minus startedAt.
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
        crashed: false,
      });
    }
  }

  // Any remaining pending entries are crashed builds
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
      crashed: true,
    });
  }

  return merged;
}
