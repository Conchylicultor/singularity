import { basename, join } from "path";
import { defineFileSink } from "@plugins/infra/plugins/file-sink/core";
import { REPO_ROOT, SINGULARITY_DIR } from "@plugins/infra/plugins/paths/core";

// Host-global, exactly like the check-result cache next door (cache.ts:18) —
// every worktree's check run appends to the SAME file, which is the point: an
// incident is investigated from whichever shell is free, not from the wedged
// worktree. `runId` + `pid` + `worktree` on every line keep the runs separable.
const PROGRESS_FILE = join(SINGULARITY_DIR, "check-progress.jsonl");

/**
 * The bound, explicit rather than defaulted. `defineFileSink`'s defaults are
 * 128 MB × 3 — a firehose budget sized for the live-state log channel, absurd for
 * a file where a FULL check run is ~155 lines. 2 MB × keep 2 is 6 MB worst case,
 * versus the ~5 MB the old hand-rolled `prune()` allowed — and it retains ~8,000
 * lines against that implementation's 2,000, i.e. dozens of runs of real history
 * rather than a handful.
 *
 * Note the shape difference this trades on: rotation cannot trim *within* a file
 * the way `prune()`'s rewrite could, so history is bought back with `keep`, not
 * with a bigger live cap. Rotated slots (`.1`, `.2`) are cold but readable —
 * `readCheckProgress` opts into stitching them, which is why `keep` matters here
 * and would be dead weight for a pure tail reader.
 *
 * `file:check-progress` shows up in `getFileSinks()` only in processes that
 * actually evaluate this module — the CLI check runner — and NOT in the server
 * where `retention` assembles growth bounds. That is fine, not a gap: the bound is
 * true by construction (`append()` IS the rotation), and the registry is a
 * per-process set feeding the deferred undeclared-growth monitor, not the thing
 * that makes the file bounded.
 */
const progressSink = defineFileSink({
  id: "check-progress",
  description:
    "Per-check-run progress log (`./singularity check`): one JSONL line per run " +
    "open, bootstrap phase, check start/end, heartbeat, and completion — so a " +
    "wedged run names the unit it is stuck in. Host-global across worktrees.",
  path: PROGRESS_FILE,
  maxBytes: 2 * 1024 * 1024,
  keep: 2,
});

/** Heartbeat cadence: frequent enough to time a hang, rare enough to be free. */
const HEARTBEAT_MS = 30_000;

interface RecordBase {
  t: string;
  runId: string;
  pid: number;
  worktree: string;
}

/**
 * `run` carries only what is knowable BEFORE any work — see `openProgressRun`.
 * The facts that cost a git spawn to learn (`treeHash`) or a module load to
 * resolve (`selected`) arrive later, on a `selected` record keyed by the same
 * `runId`. Splitting them is the whole point: a run that hangs in bootstrap
 * never learns them, and must still have announced itself.
 */
export type ProgressRecord =
  | (RecordBase & { phase: "run"; scope: string | null; requested: string[] | null })
  | (RecordBase & { phase: "bootstrap-start"; step: string })
  | (RecordBase & { phase: "bootstrap-end"; step: string; durationMs: number })
  | (RecordBase & { phase: "selected"; treeHash: string | null; selected: string[] })
  | (RecordBase & { phase: "start"; checkId: string })
  | (RecordBase & { phase: "end"; checkId: string; durationMs: number; ok: boolean; cached: boolean })
  | (RecordBase & { phase: "pending"; elapsedMs: number; pending: string[]; bootstrap: string[] })
  | (RecordBase & { phase: "done"; elapsedMs: number; allOk: boolean });

/**
 * The checkout this run is checking — which is the run's identity, since a check
 * run's whole subject is the tree it was loaded from. That makes `REPO_ROOT` the
 * right source and the other two candidates wrong: `cwd` moves during the
 * build's codegen, and `SINGULARITY_WORKTREE` is deliberately set to a dummy
 * ("barrel-import-stub") by the barrel-import stubs the build loads through
 * (barrel-import/core/internal/stubs.ts), in the SAME process that then runs
 * checks in-process — so a build's check run would misattribute itself to a
 * worktree that isn't real. `REPO_ROOT` is derived from `import.meta.dir` at
 * module load, so it names the checkout this code was read from in every path.
 */
function worktreeName(): string {
  return basename(REPO_ROOT);
}

/**
 * Append one record through the sink. Every property this log depends on survives
 * the move: `FileSink.append` is a single SYNCHRONOUS, unbuffered `appendFileSync`
 * (`file-sink/core/internal/file-sink.ts:appendLine`), which matters because both
 * real incidents ended in a hard kill — a record that is merely *queued* when the
 * signal lands is a record we never see. That one `O_APPEND` write, well under
 * 4KB, is atomic on macOS, so concurrent worktrees interleave whole lines rather
 * than corrupting each other.
 *
 * Write failures still propagate: `append` wraps nothing in a `try`, and the only
 * errors it swallows are `ENOENT` on the rotation renames (a slot that does not
 * exist yet). A full disk failing check runs loudly is the better trade against
 * silently losing the one diagnostic this file exists to provide.
 */
function writeRecord(record: ProgressRecord): void {
  progressSink.append(JSON.stringify(record));
}

/** A live run's handle: the record writers plus the heartbeat's stop. */
export interface ProgressRun {
  /**
   * Wrap one bootstrap phase (loading the checks, `git rev-parse`, the tree
   * hash, the cache, the tree snapshot). Every one of these can spawn git and
   * therefore hang, and each one that hangs must name ITSELF — a bootstrap hang
   * used to be indistinguishable from a run that never started at all.
   */
  bootstrap<T>(step: string, fn: () => T | Promise<T>): Promise<T>;
  /**
   * The facts bootstrap had to run to learn. Emitted as a follow-up record so
   * the `run` record itself can be written before any of that work begins.
   */
  resolved(treeHash: string | null, selected: string[]): void;
  /** Record a check entering its body. Written BEFORE the body runs. */
  checkStarted(checkId: string): void;
  /** Record a check settling. Written from a `finally`, so a throw still lands. */
  checkEnded(checkId: string, durationMs: number, ok: boolean, cached: boolean): void;
  /** Write the terminal `done` record and stop the heartbeat. Idempotent-safe. */
  finish(allOk: boolean): void;
}

/**
 * Open a run: mint the `run` record and arm the `pending` heartbeat. (Retention
 * is no longer a step here — the sink rotates inside `append` itself.)
 *
 * MUST be the first thing `runChecks` does — before the checks are even loaded,
 * and certainly before the first `git` spawn. The earlier draft opened the run
 * just above the `Promise.all`, i.e. after `getRoot()` / `computeTreeHash()` /
 * `openCheckCache()` / `loadTreeSnapshot()`, and a run that wedged in any of
 * those wrote literally nothing — reproducing, inside the diagnostic itself,
 * the exact blindness the diagnostic exists to remove. Hence the argument list:
 * only what is knowable with zero work (the caller's own request), with
 * everything else deferred to `resolved()`.
 *
 * The two mechanisms here are deliberately independent. `start`/`end` (and
 * `bootstrap-start`/`bootstrap-end`) are timer-free — they are on disk before a
 * hang begins, so the culprit is the set difference `started − ended` even if
 * the event loop were fully blocked. The heartbeat needs a live loop and adds
 * the time dimension (how long each unit has been outstanding). If either
 * assumption about the hang's nature is wrong, the other still names it.
 */
export function openProgressRun(args: {
  scope: string | null;
  /** The ids the caller named, or null for "every check". */
  requested: string[] | null;
}): ProgressRun {
  const runId = crypto.randomUUID();
  const pid = process.pid;
  const worktree = worktreeName();
  const startedAt = performance.now();
  const stamp = (): { t: string; runId: string; pid: number; worktree: string } => ({
    t: new Date().toISOString(),
    runId,
    pid,
    worktree,
  });

  writeRecord({ ...stamp(), phase: "run", scope: args.scope, requested: args.requested });

  const inFlight = new Set<string>();
  const inBootstrap = new Set<string>();

  // `.unref()` so this timer can never be the reason the process stays alive —
  // the heartbeat exists to observe a hang, not to cause one.
  const heartbeat = setInterval(() => {
    if (inFlight.size === 0 && inBootstrap.size === 0) return;
    writeRecord({
      ...stamp(),
      phase: "pending",
      elapsedMs: Math.round(performance.now() - startedAt),
      pending: [...inFlight],
      bootstrap: [...inBootstrap],
    });
  }, HEARTBEAT_MS);
  heartbeat.unref();

  return {
    async bootstrap(step, fn) {
      inBootstrap.add(step);
      writeRecord({ ...stamp(), phase: "bootstrap-start", step });
      const phaseStart = performance.now();
      try {
        return await fn();
      } finally {
        // Same `finally` discipline as a check's `end`: a bootstrap phase that
        // THROWS must not be left looking like one that never returned.
        inBootstrap.delete(step);
        writeRecord({
          ...stamp(),
          phase: "bootstrap-end",
          step,
          durationMs: Math.round(performance.now() - phaseStart),
        });
      }
    },
    resolved(treeHash, selected) {
      writeRecord({ ...stamp(), phase: "selected", treeHash, selected });
    },
    checkStarted(checkId) {
      inFlight.add(checkId);
      writeRecord({ ...stamp(), phase: "start", checkId });
    },
    checkEnded(checkId, durationMs, ok, cached) {
      inFlight.delete(checkId);
      writeRecord({ ...stamp(), phase: "end", checkId, durationMs, ok, cached });
    },
    finish(allOk) {
      clearInterval(heartbeat);
      writeRecord({
        ...stamp(),
        phase: "done",
        elapsedMs: Math.round(performance.now() - startedAt),
        allOk,
      });
    },
  };
}

/** One outstanding unit of work: started, never ended. The hang suspect. */
export interface OutstandingCheck {
  checkId: string;
  startedAt: string;
  /** Milliseconds between its `start` and the run's last observed activity. */
  elapsedMs: number;
}

/** A reconstructed run, newest activity last. */
export interface CheckRunProgress {
  runId: string;
  pid: number;
  worktree: string;
  scope: string | null;
  /** The ids the caller named, or null for "every check". Known at `run` time. */
  requested: string[] | null;
  /** Null until the run's `selected` record lands, i.e. until bootstrap ends. */
  treeHash: string | null;
  startedAt: string;
  /** Last line seen for this run — a heartbeat, an `end`, or the `run` itself. */
  lastActivityAt: string;
  /** Null while the run is still in bootstrap: the set isn't resolved yet. */
  selected: string[] | null;
  startedCount: number;
  endedCount: number;
  /**
   * Bootstrap phases started and never ended. Non-empty means the run never
   * reached its checks at all — read this BEFORE `outstanding`, which is
   * necessarily empty in that case and would otherwise read as "healthy".
   */
  outstandingBootstrap: OutstandingCheck[];
  /** `started − ended`: empty for a healthy run, the culprit set for a hung one. */
  outstanding: OutstandingCheck[];
  /** Present iff the run reached its `done` record. */
  done: { at: string; elapsedMs: number; allOk: boolean } | null;
}

/**
 * Read the progress file and reconstruct each run. Tolerant by construction:
 * lines from concurrent worktrees interleave freely (they are grouped by
 * `runId`), a run whose `selected` record has not landed yet is a first-class
 * state rather than a parse failure, and a trailing partial line — the normal
 * state while a run is mid-write, which is exactly when this is read — is
 * skipped rather than fatal (`readJsonlTail` owns that skip now).
 *
 * `includeRotated` is NOT optional here. This is a *reconstructing* reader, not a
 * tail: a run straddling a rotation would otherwise lose its `run` line to `.1`
 * and become unattributable orphan lines. The 8 MB budget covers the sink's entire
 * 6 MB footprint (2 MB live + 2 rotations), so in practice nothing is clipped.
 *
 * Returns newest run first, ordered by last activity.
 */
export function readCheckProgress(): CheckRunProgress[] {
  const result = progressSink.readJsonlTail<ProgressRecord>({
    includeRotated: true,
    maxBytes: 8 * 1024 * 1024, // covers the full 6 MB footprint
  });
  if (result.kind === "missing") return []; // no run has ever executed on this host

  const runs = new Map<string, CheckRunProgress>();
  const startsByRun = new Map<string, Map<string, string>>();
  const bootstrapByRun = new Map<string, Map<string, string>>();

  for (const record of result.records) {
    if (record.phase === "run") {
      runs.set(record.runId, {
        runId: record.runId,
        pid: record.pid,
        worktree: record.worktree,
        scope: record.scope,
        requested: record.requested,
        treeHash: null,
        startedAt: record.t,
        lastActivityAt: record.t,
        selected: null,
        startedCount: 0,
        endedCount: 0,
        outstandingBootstrap: [],
        outstanding: [],
        done: null,
      });
      startsByRun.set(record.runId, new Map());
      bootstrapByRun.set(record.runId, new Map());
      continue;
    }
    const run = runs.get(record.runId);
    // A run whose `run` line has rotated past `.2` (or fell outside the read
    // budget) leaves orphan lines; there is nothing to attribute them to, so drop
    // them rather than invent a run.
    if (!run) continue;
    run.lastActivityAt = record.t;
    const starts = startsByRun.get(record.runId);
    const boots = bootstrapByRun.get(record.runId);
    if (!starts || !boots) continue;
    if (record.phase === "bootstrap-start") {
      boots.set(record.step, record.t);
    } else if (record.phase === "bootstrap-end") {
      boots.delete(record.step);
    } else if (record.phase === "selected") {
      run.treeHash = record.treeHash;
      run.selected = record.selected;
    } else if (record.phase === "start") {
      run.startedCount += 1;
      starts.set(record.checkId, record.t);
    } else if (record.phase === "end") {
      run.endedCount += 1;
      starts.delete(record.checkId);
    } else if (record.phase === "done") {
      run.done = { at: record.t, elapsedMs: record.elapsedMs, allOk: record.allOk };
    }
  }

  for (const run of runs.values()) {
    const last = Date.parse(run.lastActivityAt);
    const outstandingFrom = (m: Map<string, string> | undefined): OutstandingCheck[] =>
      [...(m ?? [])].map(([checkId, startedAt]) => ({
        checkId,
        startedAt,
        elapsedMs: last - Date.parse(startedAt),
      }));
    run.outstanding = outstandingFrom(startsByRun.get(run.runId));
    run.outstandingBootstrap = outstandingFrom(bootstrapByRun.get(run.runId));
  }

  return [...runs.values()].sort(
    (a, b) => Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt),
  );
}
