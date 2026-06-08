import { join } from "path";
import { readFileSync } from "fs";
import { SINGULARITY_DIR } from "@plugins/infra/plugins/paths/server";

export interface PushContentionRecord {
  // A push now emits phased records (lock_requested / lock_acquired / completed).
  // Stats only care about real completed pushes — see the filter below.
  phase?: "lock_requested" | "lock_acquired" | "completed";
  pushId: string;
  branch: string;
  conversationId: string | null;
  worktree: string | null;
  mode: "worktree" | "from-main";
  startedAt: string;
  lockRequestedAt: string;
  lockAcquiredAt: string;
  completedAt: string;
  preLockMs: number;
  waitMs: number;
  holdMs: number;
  totalMs: number;
  outcome: "success" | "failed_rebase" | "failed_checks" | "failed_push" | "error";
  // Set on records written by the orphan reconciler for pushes hard-killed
  // mid-flight. Excluded from stats — these never wrote a real terminal record
  // and have no meaningful wait/step data.
  interrupted?: boolean;
  steps: Array<{ name: string; startMs: number; durationMs: number }>;
}

const CONTENTION_FILE = join(SINGULARITY_DIR, "push-contention.jsonl");

export function readContentionRecords(): PushContentionRecord[] {
  let raw: string;
  try {
    raw = readFileSync(CONTENTION_FILE, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    return [];
  }
  const records: PushContentionRecord[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let record: PushContentionRecord;
    try {
      record = JSON.parse(trimmed) as PushContentionRecord;
    } catch (err) {
      if (!(err instanceof SyntaxError)) throw err;
      continue;
    }
    // Keep only terminal records — one per completed push. The in-flight phases
    // (lock_requested/lock_acquired) are partial and would corrupt aggregates;
    // legacy records have no phase and are terminal. Interrupted (reconciled)
    // pushes never produced real data, so they stay out of the stats.
    if (record.phase === "lock_requested" || record.phase === "lock_acquired") continue;
    if (record.interrupted) continue;
    records.push(record);
  }
  return records;
}
