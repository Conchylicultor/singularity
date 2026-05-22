import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { SINGULARITY_DIR } from "./paths";

export interface BuildLogRecord {
  phase: "started" | "completed";
  worktree: string;
  branch: string;
  startedAt: string;
  completedAt: string | null;
  totalMs: number;
  success: boolean;
}

const BUILD_LOG_FILE = join(SINGULARITY_DIR, "build-log.jsonl");

export function appendBuildLog(record: BuildLogRecord): void {
  mkdirSync(SINGULARITY_DIR, { recursive: true });
  appendFileSync(BUILD_LOG_FILE, JSON.stringify(record) + "\n");
}
