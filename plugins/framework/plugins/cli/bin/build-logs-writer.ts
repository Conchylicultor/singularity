import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { worktreeDataDir } from "./paths";

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

/** Plain-text render of every step, mirroring the console layout. */
function renderStepsText(allSteps: BuildStepLog[]): string {
  const out: string[] = [];
  for (const step of allSteps) {
    const icon = step.success ? "✓" : "✗";
    const duration = (step.durationMs / 1000).toFixed(1);
    const header = `── ${step.label} ${icon} (${duration}s) `;
    const pad = Math.max(0, 60 - header.length);
    out.push(header + "─".repeat(pad));
    for (const line of step.lines) out.push(`  ${line.text}`);
  }
  return out.join("\n") + "\n";
}

function writeAtomic(path: string, contents: string): void {
  const tmp = `${path}.tmp.${process.pid}`;
  writeFileSync(tmp, contents);
  renameSync(tmp, path);
}

/**
 * Persist the build transcript both as structured JSON (consumed by the
 * profiling UI) and as a human-readable `build.log` text file. Returns the
 * absolute path to the text log so callers can point at it on the last line of
 * a failure — readable directly, even when the console output was piped through
 * `tail`.
 */
export function writeBuildLogs(name: string): string {
  const logs: BuildLogs = { steps };
  const dir = worktreeDataDir(name);
  mkdirSync(dir, { recursive: true });
  const buildId = process.env.SINGULARITY_BUILD_ID;
  const jsonPath = join(dir, buildId ? `build-logs-${buildId}.json` : `build-logs.json`);
  writeAtomic(jsonPath, JSON.stringify(logs, null, 2) + "\n");
  const textPath = join(dir, buildId ? `build-${buildId}.log` : `build.log`);
  writeAtomic(textPath, renderStepsText(steps));
  return textPath;
}
