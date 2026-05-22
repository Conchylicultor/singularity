import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { WORKTREES_DIR } from "./paths";

export interface BuildStepLog {
  id: string;
  label: string;
  lines: Array<{ text: string; stream: "stdout" | "stderr" }>;
  durationMs: number;
  success: boolean;
}

export interface BuildLogs {
  steps: BuildStepLog[];
}

const steps: BuildStepLog[] = [];

export function pushBuildStepLog(step: BuildStepLog): void {
  steps.push(step);
}

export function writeBuildLogs(name: string): void {
  const logs: BuildLogs = { steps };
  mkdirSync(WORKTREES_DIR, { recursive: true });
  const buildId = process.env.SINGULARITY_BUILD_ID;
  const filename = buildId
    ? `${name}-build-logs-${buildId}.json`
    : `${name}-build-logs.json`;
  const path = join(WORKTREES_DIR, filename);
  const tmp = `${path}.tmp.${process.pid}`;
  writeFileSync(tmp, JSON.stringify(logs, null, 2) + "\n");
  renameSync(tmp, path);
}
