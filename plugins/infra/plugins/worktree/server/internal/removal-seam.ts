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
/**
 * How an in-app removal took the checkout away. The first two are the strategies
 * `removeWorktree` chooses between. `checkout-rollback` is the removal nobody
 * asks for: a `git worktree add` that fails deletes the partial checkout it had
 * started writing. Git does that itself when it is killed mid-checkout (a
 * backend restart signals the whole process group, git included), and
 * `setupWorktree` does it with its own `rm` after killing an add that overran.
 */
export type RemovalBranch =
  "git-worktree-remove" | "rm-and-prune" | "checkout-rollback";

/**
 * One announcement about an in-app removal. `phase` discriminates the arms:
 * `start` / `ok` / `failed` bracket a `removeWorktree` call, and
 * `checkout-failed` is the single line a failed `git worktree add` leaves — its
 * partial checkout, if it had written one, is gone by the time it is emitted.
 */
export interface WorktreeRemovalEvent {
  phase: "start" | "ok" | "failed" | "checkout-failed";
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
  /**
   * null while the operation is still running. The correlation window counts
   * from here, not from `startedAt`: an operation can run for longer than the
   * window (a removal queued behind the mutate gate, a checkout that overruns
   * until its own timeout), and its directory vanishes at the END of it.
   */
  endedAt: number | null;
  /** null until `removeWorktree` has chosen its strategy. */
  branch: RemovalBranch | null;
}

// A bounded ring, not an unbounded log: this is a correlation buffer read only
// by the watcher over a short window, so old entries have no consumer. Plain
// memory, no imports — which is what keeps this module safe for the lean graph.
const RECENT_MAX = 200;
const recent: InAppRemovalRecord[] = [];

/**
 * In-app removals still running, or ended within `withinMs`. A running one
 * always counts — however long it has queued on the host-wide mutate gate, its
 * directory is about to go. An ended one counts only for a bounded window:
 * matching an id against an hours-old entry would let one real removal launder a
 * later external deletion of a recreated worktree.
 */
export function recentInAppRemovals(
  withinMs: number,
  now: number = Date.now(),
): InAppRemovalRecord[] {
  return recent.filter(
    (r) => r.endedAt === null || now - r.endedAt <= withinMs,
  );
}

function remember(record: InAppRemovalRecord): void {
  recent.push(record);
  if (recent.length > RECENT_MAX) recent.splice(0, recent.length - RECENT_MAX);
}

function forget(record: InAppRemovalRecord): void {
  const i = recent.indexOf(record);
  if (i !== -1) recent.splice(i, 1);
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
    endedAt: null,
    branch: null,
  };
  remember(record);
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
  record.endedAt = Date.now();
  worktreeRemovalSink.emit({
    phase: outcome.ok ? "ok" : "failed",
    id: record.id,
    path: record.path,
    pid: record.pid,
    branch: record.branch,
    durationMs: record.endedAt - record.startedAt,
    ...(outcome.ok ? {} : { error: outcome.error }),
  });
}

/**
 * Run a `git worktree add` (and whatever cleanup follows it) while claiming the
 * path it creates, so a checkout that fails is not reported as deleted by an
 * outside actor.
 *
 * A failed add removes its own partial checkout, and it does so BEFORE the
 * caller learns it failed: git deletes the half-written directory from its own
 * signal handler when it is killed, and the watcher can see the directory go
 * while `spawnCaptured` is still reaping the child. So the claim is taken before
 * `fn` runs, the same ordering `beginInAppRemoval` uses and for the same reason.
 *
 * A successful `fn` drops the claim silently — the checkout exists, nothing
 * vanished, and a claim left standing would let a later external deletion of
 * the fresh checkout pass as ours. A throwing `fn` ends the claim, announces
 * `checkout-failed` with the error, and rethrows; the claim then covers the
 * correlation window after the failure like any finished removal.
 */
export async function withCheckoutClaim<T>(
  path: string,
  fn: () => Promise<T>,
): Promise<T> {
  const record: InAppRemovalRecord = {
    id: basename(path),
    path,
    pid: process.pid,
    startedAt: Date.now(),
    endedAt: null,
    branch: "checkout-rollback",
  };
  remember(record);
  let value: T;
  try {
    value = await fn();
  } catch (err) {
    record.endedAt = Date.now();
    worktreeRemovalSink.emit({
      phase: "checkout-failed",
      id: record.id,
      path: record.path,
      pid: record.pid,
      branch: record.branch,
      durationMs: record.endedAt - record.startedAt,
      error: String(err),
    });
    throw err;
  }
  forget(record);
  return value;
}
