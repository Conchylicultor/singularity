import { basename } from "node:path";
import { defineReportSink } from "@plugins/primitives/plugins/report-sink/core";

/**
 * The seam every in-app worktree-checkout removal is announced on, and the
 * bounded ring of recent removals the audit watcher correlates against.
 *
 * WHY A SEAM AND NOT A LOG CHANNEL HERE. This module is reached from the
 * `tools` tsconfig target (via `infra/launcher/bin`), whose `lib` is ES2023 with
 * no DOM. Calling `defineLogSink` here pulls `log-channels/server` →
 * `endpoints/server` → `endpoints/core/codec.ts`, which references `BodyInit`
 * and `FormData` — so a durable channel declared in this lean library breaks
 * type-check for every tooling entry point that merely wanted `worktreePathFor`.
 *
 * It is also the wrong layering independently of that: `infra/worktree` is a
 * CRUD primitive imported by sixteen plugins and must not name the observability
 * stack. The `removal-audit` sub-plugin registers a handler on this seam and
 * owns the durable channel and the report kind — the same dependency inversion
 * the durable-signals accounting states for report/timeline consumers.
 *
 * `emit()` never throws (the report-sink contract), so observability can never
 * take down the removal it describes.
 */
export type RemovalBranch = "git-worktree-remove" | "rm-and-prune";

/** One announcement about an in-app removal. `phase` discriminates the arms. */
export interface WorktreeRemovalEvent {
  phase: "start" | "ok" | "failed";
  id: string;
  path: string;
  pid: number;
  /** Caller frames — `start` only, where the attribution actually lives. */
  caller?: string;
  branch?: RemovalBranch | null;
  durationMs?: number;
  error?: string;
}

export const worktreeRemovalSink = defineReportSink<WorktreeRemovalEvent>();

/**
 * One in-flight or completed in-app removal. Recorded at the START of the
 * operation (not the end) because the watcher can observe the directory
 * vanishing while the removal is still running — a record written afterwards
 * would lose that race and mis-attribute our own removal as external.
 */
export interface InAppRemovalRecord {
  /** Worktree id — the checkout dir's basename, which is the attempt id. */
  id: string;
  path: string;
  pid: number;
  startedAt: number;
  /** null until `removeWorktree` has chosen its strategy. */
  branch: RemovalBranch | null;
}

// A bounded ring, not an unbounded log: this is a correlation buffer read only
// by the watcher over a short window, so old entries have no consumer. Plain
// memory, no imports — which is what keeps this module safe for the lean graph.
const RECENT_MAX = 200;
const recent: InAppRemovalRecord[] = [];

/**
 * In-app removals started within `withinMs`. The window is generous (the
 * removal is recorded before it queues on the host-wide mutate gate, so a
 * contended removal can sit for a while before its directory actually goes),
 * but bounded — matching an id against an hours-old entry would let one real
 * removal launder a later external deletion of a recreated worktree.
 */
export function recentInAppRemovals(
  withinMs: number,
  now: number = Date.now(),
): InAppRemovalRecord[] {
  return recent.filter((r) => now - r.startedAt <= withinMs);
}

// The frames that identify the caller, minus this module's own. Trimmed to a
// handful: the point is naming the call site (reaper job vs. delete endpoint vs.
// something new), not carrying a full trace into a log line.
function callerFrames(): string {
  const stack = new Error("worktree-removal").stack ?? "";
  return stack
    .split("\n")
    .slice(3, 9)
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" | ");
}

/** Record + announce the INTENT to remove a checkout, before anything destructive runs. */
export function beginInAppRemoval(path: string): InAppRemovalRecord {
  const record: InAppRemovalRecord = {
    id: basename(path),
    path,
    pid: process.pid,
    startedAt: Date.now(),
    branch: null,
  };
  recent.push(record);
  if (recent.length > RECENT_MAX) recent.splice(0, recent.length - RECENT_MAX);
  worktreeRemovalSink.emit({
    phase: "start",
    id: record.id,
    path: record.path,
    pid: record.pid,
    caller: callerFrames(),
  });
  return record;
}

/** Stamp which strategy `removeWorktree` chose, once it knows. */
export function setRemovalBranch(
  record: InAppRemovalRecord,
  branch: RemovalBranch,
): void {
  record.branch = branch;
}

/** Announce the outcome. Called for BOTH success and failure so neither is silent. */
export function finishInAppRemoval(
  record: InAppRemovalRecord,
  outcome: { ok: true } | { ok: false; error: string },
): void {
  worktreeRemovalSink.emit({
    phase: outcome.ok ? "ok" : "failed",
    id: record.id,
    path: record.path,
    pid: record.pid,
    branch: record.branch,
    durationMs: Date.now() - record.startedAt,
    ...(outcome.ok ? {} : { error: outcome.error }),
  });
}
