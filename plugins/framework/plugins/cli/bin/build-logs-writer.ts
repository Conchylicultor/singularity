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
  /**
   * Wall-clock instant (epoch ms) the build reached its terminal state. An
   * auto-build restarts the very backend that spawned it, so the tracking
   * process is SIGTERM-killed before it can stamp build_runs.finished_at at the
   * true exit — the row is instead closed later by reconcileOrphanBuilds, which
   * reads this field so Duration reflects the real finish, not the reconcile.
   */
  finishedAt: number;
}

/**
 * A single build's step-log accumulator + writer. One collector owns one
 * `steps[]`, built either by pushing a fully-formed step (`pushStep`, the legacy
 * seam) or incrementally via `beginStep` + `line`. Callers in main use the
 * module-default instance via the wrapper exports below.
 */
export interface StepLogCollector {
  /**
   * Opens a step and makes it the current one for `line()`. The returned
   * end-closure records the step's `durationMs` + `success` and closes it.
   */
  beginStep(id: string, label: string): (success: boolean) => void;
  /**
   * Appends a line to the currently open step. When no step is open, an implicit
   * verdict-free `output` step is opened to hold it (and left open for the next
   * lines) — the simplest never-drop-a-line behavior, and `success: true` so this
   * synthetic step can never itself fail the orphan-exit verdict.
   */
  line(text: string, stream: "stdout" | "stderr"): void;
  /** Writes `build-logs-<runId>.json` + `build-<runId>.log` under worktree `name`. */
  write(name: string, runId: string, trailer?: string): void;
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

interface StepLogCollectorInternal extends StepLogCollector {
  /** Legacy seam: push a fully-formed step (build.ts builds the whole step, then pushes it). */
  pushStep(step: BuildStepLog): void;
  /**
   * Broader write accepting the id-less (`undefined`) case (so the module-default
   * collector can still produce the unsuffixed `build-logs.json` / `build.log`) and
   * returning the text-log path for the failure-line pointer.
   */
  writeLogs(name: string, buildId: string | undefined, trailer?: string): string;
}

function makeStepLogCollector(): StepLogCollectorInternal {
  const steps: BuildStepLog[] = [];
  // The step `line()` appends to; null between steps until beginStep or an
  // implicit `output` step is opened.
  let currentStep: BuildStepLog | null = null;

  function writeLogs(
    name: string,
    buildId: string | undefined,
    trailer?: string,
  ): string {
    const logs: BuildLogs = { steps, finishedAt: Date.now() };
    const dir = worktreeDataDir(name);
    mkdirSync(dir, { recursive: true });
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

  return {
    beginStep(id, label) {
      const start = performance.now();
      const step: BuildStepLog = { id, label, lines: [], durationMs: 0, success: false };
      steps.push(step);
      currentStep = step;
      return (success: boolean) => {
        step.durationMs = Math.round(performance.now() - start);
        step.success = success;
        if (currentStep === step) currentStep = null;
      };
    },
    line(text, stream) {
      if (!currentStep) {
        currentStep = { id: "output", label: "output", lines: [], durationMs: 0, success: true };
        steps.push(currentStep);
      }
      currentStep.lines.push({ text, stream });
    },
    pushStep(step) {
      steps.push(step);
    },
    write(name, runId, trailer) {
      writeLogs(name, runId, trailer);
    },
    writeLogs,
  };
}

export function createStepLogCollector(): StepLogCollector {
  return makeStepLogCollector();
}

// The module-default collector backing the legacy wrappers below, so every current
// caller (build.ts) is byte-for-byte unaffected.
const defaultCollector = makeStepLogCollector();

export function pushBuildStepLog(step: BuildStepLog): void {
  defaultCollector.pushStep(step);
}

/**
 * Persist the build transcript both as structured JSON (consumed by the
 * profiling UI) and as a human-readable `build.log` text file. Returns the
 * absolute path to the text log so callers can point at it on the last line of
 * a failure — readable directly, even when the console output was piped through
 * `tail`.
 */
export function writeBuildLogs(name: string, trailer?: string): string {
  return defaultCollector.writeLogs(name, process.env.SINGULARITY_BUILD_ID, trailer);
}
