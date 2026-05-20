import { join } from "path";
import { readFileSync } from "fs";
import { SINGULARITY_DIR } from "@plugins/infra/plugins/paths/server";

export interface PushContentionRecord {
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
  steps: Array<{ name: string; startMs: number; durationMs: number }>;
}

const CONTENTION_FILE = join(SINGULARITY_DIR, "push-contention.jsonl");

export function readContentionRecords(): PushContentionRecord[] {
  let raw: string;
  try {
    raw = readFileSync(CONTENTION_FILE, "utf-8");
  } catch {
    return [];
  }
  const records: PushContentionRecord[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      records.push(JSON.parse(trimmed) as PushContentionRecord);
    } catch {
      continue;
    }
  }
  return records;
}
