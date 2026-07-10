import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { worktreeDataDir, worktreeArtifacts, pruneWorktreeBuildArtifacts } from "./paths";
import { renderStepBlock, orderStepsForDisplay } from "./build-output";

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
  for (const step of orderStepsForDisplay(allSteps)) {
    for (const { text } of renderStepBlock(step)) out.push(text);
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
export function writeBuildLogs(name: string, trailer?: string): string {
  const logs: BuildLogs = { steps };
  const dir = worktreeDataDir(name);
  mkdirSync(dir, { recursive: true });
  const buildId = process.env.SINGULARITY_BUILD_ID;
  const jsonPath = worktreeArtifacts.buildLogs(name, buildId);
  // The JSON payload is deliberately push-order and verdict-free: run-build.ts's
  // resolveOrphanExitCode and build-fix-section.tsx both read `steps[].success`.
  writeAtomic(jsonPath, JSON.stringify(logs, null, 2) + "\n");
  const textPath = worktreeArtifacts.buildLogText(name, buildId);
  const text = trailer ? `${renderStepsText(steps)}\n${trailer}\n` : renderStepsText(steps);
  writeAtomic(textPath, text);
  // Writing a new set trims the old ones — the leak fix. Safe for the just-written
  // files (newest mtime ⇒ always retained) and idempotent with writeBuildProfile's
  // own prune call at the same finalize point.
  pruneWorktreeBuildArtifacts(name);
  return textPath;
}
