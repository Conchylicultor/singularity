import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { runTracked } from "@plugins/infra/plugins/runtime-profiler/core";
import {
  REPO_ROOT,
  currentWorktreeName,
  isMain,
  worktreeDataDir,
  worktreeArtifacts,
  pruneWorktreeBuildArtifacts,
} from "@plugins/infra/plugins/paths/server";
import type { Namespace } from "@plugins/infra/plugins/namespace/core";
import { recordNotification } from "@plugins/shell/plugins/notifications/server";
import { getConfig } from "@plugins/config_v2/server";
import { buildDetailRoute } from "@plugins/build/core";
import {
  BUILD_EXIT_SUPERSEDED,
  buildStatusOf,
  killedSignalName,
} from "@plugins/build/plugins/build-status/core";
import { buildConfig } from "../../shared";
import { agentManagerApp } from "@plugins/apps/plugins/agent-manager/plugins/shell/core";
import { _buildRuns } from "@plugins/build/plugins/run-ledger/server";
import { frontendHashResource } from "./frontend-hash-resource";
import { buildLog } from "./build-log";

// In-process re-entry guard only. The authoritative, restart-durable lock lives
// in the DB (see hasLiveInflightBuild) — `./singularity build` restarts this very
// backend, so a boolean held in memory is wiped mid-build and the freshly-booted
// process would happily start a second, overlapping build.
let inflight = false;

/**
 * Whether OS process `pid` is currently alive. `process.kill(pid, 0)` sends no
 * signal; it throws ESRCH when the process is gone. EPERM means the process
 * exists but is owned by another user — still alive.
 */
export function isPidAlive(pid: number | null): boolean {
  if (pid == null) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Durable, cross-restart build lock: a build is in-flight iff some build_runs row
 * is unfinished AND the `./singularity build` process that owns it is still
 * running. Because the build restarts this backend, the spawning server process
 * is routinely killed mid-build; without this the new backend (and its on-boot
 * re-enqueue) would start a second build that races the first, and whichever
 * owner dies before finalizing leaves a phantom null-exit "failed" row.
 *
 * Also read by the boot-adopted watch (watch-inflight-build) to know when the
 * build it adopted has finished and the watcher may self-dispose.
 */
export async function hasLiveInflightBuild(): Promise<boolean> {
  const rows = await db
    .select({ pid: _buildRuns.pid })
    .from(_buildRuns)
    .where(
      and(
        isNull(_buildRuns.finishedAt),
        eq(_buildRuns.namespace, currentWorktreeName()),
      ),
    );
  return rows.some((r) => isPidAlive(r.pid));
}

/**
 * The commit a live in-flight build was claimed for, or `null` if none is live.
 *
 * Read by the boot-adopted watch: a build that restarts this backend outlives
 * the `triggerBuild` call that knew its commit, so the freshly-booted process
 * recovers that baseline from the row in order to converge when the build ends.
 */
export async function liveInflightBuildCommit(): Promise<string | null> {
  const rows = await db
    .select({ pid: _buildRuns.pid, commitHash: _buildRuns.commitHash })
    .from(_buildRuns)
    .where(
      and(
        isNull(_buildRuns.finishedAt),
        eq(_buildRuns.namespace, currentWorktreeName()),
      ),
    );
  return rows.find((r) => isPidAlive(r.pid))?.commitHash ?? null;
}

/**
 * Read the *true* terminal record (exit code + finish instant) of a build from
 * the durable per-build log the detached `./singularity build` writes
 * (build-logs-<id>.json), or `null` when no terminal signal exists yet.
 *
 * An auto-build from main restarts *this very backend* mid-build, so the process
 * that spawned the build (and `await`s `proc.exited`) is routinely SIGTERM-killed
 * before it can record the result — while the build CLI itself survives the
 * restart and runs to completion. Without consulting its artifact we'd blindly
 * stamp every such row exit=-1, turning a fully successful deploy into a phantom
 * "Build failed" (the build button then shows red even though the app updated).
 *
 * The `finishedAt` in the same artifact is the build's *real* terminal instant.
 * Reusing `new Date()` at reconcile time instead would inflate the row's Duration
 * by the entire gap between the CLI exiting and the next reconcile pass noticing
 * the dead pid (often many minutes), so Duration would disagree with the build
 * profile. We prefer the recorded instant; the caller supplies its own fallback
 * when the artifact carries none.
 *
 * The CLI writes this file — atomically (tmp + rename), exactly once — at every
 * terminal it can reach: full success, a checks/vite step failure, and an abort,
 * where the process was ended from outside and the exit-time verdict guard is the
 * writer. Never mid-build. So a non-null return is a race-free "build finished"
 * push signal: reconcileOrphanBuilds uses it both to recover the exit code AND as
 * the terminal-detection condition, even while the CLI pid may still be alive for
 * the moment before it reaps.
 *
 * The exit code comes from the artifact's own `exitCode`, never from the steps,
 * because an aborted build's steps are all green — the one it died inside never
 * closed — so a `steps.every(s => s.success)` reading would report a kill as a
 * successful deploy. That derivation survives only as the fallback for artifacts
 * written before `exitCode` existed.
 *
 * Returns `null` when the artifact is absent (ENOENT — a hard SIGKILL, or a
 * post-publish boot/health-probe failure that exits before the log is written),
 * unparseable (SyntaxError), or carries no `finishedAt` / neither an `exitCode`
 * nor a step to derive one from — i.e. no clean terminal signal. Any other read
 * error is a genuine fault and rethrows.
 */
export function readBuildTerminal(
  buildId: string,
): { exitCode: number; finishedAt: Date } | null {
  const name = currentWorktreeName();
  const path = worktreeArtifacts.buildLogs(name, buildId);
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as {
      steps?: Array<{ success: boolean }>;
      finishedAt?: number;
      exitCode?: number;
    };
    const steps = parsed.steps ?? [];
    // A terminal record is `finishedAt` plus something to read the outcome from.
    // An abort can close zero steps, so step-count alone no longer qualifies it.
    if (parsed.finishedAt == null) return null;
    if (parsed.exitCode == null && steps.length === 0) return null;
    const exitCode = parsed.exitCode ?? (steps.every((s) => s.success) ? 0 : 1);
    return { exitCode, finishedAt: new Date(parsed.finishedAt) };
  } catch (err) {
    if (
      (err as NodeJS.ErrnoException).code !== "ENOENT" &&
      !(err instanceof SyntaxError)
    )
      throw err;
    return null;
  }
}

/** Writes `contents` at `path` atomically, unless something is already there. */
function writeArtifactIfAbsent(path: string, contents: string): void {
  // Never overwrite the CLI's own: it is the authoritative writer, this is only
  // the recovery for the case where it never got to run one.
  if (existsSync(path)) return;
  const tmp = `${path}.tmp.${process.pid}`;
  writeFileSync(tmp, contents);
  renameSync(tmp, path);
}

/** The one line that tells a reader this transcript is not the build's own. */
const RECOVERED_HEADER =
  "(recovered by the backend — this build was killed before writing its own transcript)";

/**
 * Write, from the output this backend captured, the artifacts a build died before
 * writing itself. SIGKILL runs no handler, so the CLI's own exit-time guard never
 * fires and both of these are missing — including `build-<id>.log`, which the
 * build's verdict names on its last line, so without this the pointer a reader
 * follows resolves to nothing.
 *
 * Both files, from one helper, so a future third artifact cannot be half-written:
 * the set is written together or not at all. Each write is skipped when the CLI's
 * own file is already there, and each is atomic, so a reader never sees a partial.
 *
 * `exitCode` is the code the caller also stamps on the build_runs row, which is
 * what makes the artifact and the row agree by construction — `readBuildTerminal`
 * then recovers the same value a later reconcile pass would have had to guess.
 */
export function recoverBuildArtifacts(opts: {
  worktree: Namespace;
  buildId: string;
  lines: Array<{ text: string; stream: "stdout" | "stderr" }>;
  durationMs: number;
  finishedAt: Date;
  exitCode: number;
}): void {
  const { worktree, buildId, lines, durationMs, finishedAt, exitCode } = opts;
  mkdirSync(worktreeDataDir(worktree), { recursive: true });
  // One synthetic step holding the whole captured stream: the CLI's per-step
  // structure died with it, and inventing a shape it never reported would be
  // worse than a single honest block.
  const logs = {
    steps: [
      {
        id: "raw",
        label: "Build Output",
        lines,
        durationMs,
        success: exitCode === 0,
      },
    ],
    // Terminal instant, so a later reconcile pass reading this fallback artifact
    // recovers the real finish rather than its own `now`.
    finishedAt: finishedAt.getTime(),
    exitCode,
  };
  writeArtifactIfAbsent(
    worktreeArtifacts.buildLogs(worktree, buildId),
    JSON.stringify(logs) + "\n",
  );
  // Verbatim, under the header — this is the text the verdict's `Full output:`
  // pointer promised, and reformatting it would make the two disagree.
  writeArtifactIfAbsent(
    worktreeArtifacts.buildLogText(worktree, buildId),
    [RECOVERED_HEADER, "", ...lines.map((l) => l.text)].join("\n") + "\n",
  );
  // A build the backend had to recover (mid-build restart) may never have reached
  // the CLI's own prune, so cap this namespace's artifacts here too.
  pruneWorktreeBuildArtifacts(worktree);
}

/**
 * Close any unfinished build_runs rows for this namespace that have reached
 * terminal — either the build's atomic-once log artifact is present (⇒ finished:
 * it is written exactly once, at terminal, never mid-build, so this can never
 * false-positive a still-running build) OR the owning process is dead. Stamp the
 * artifact's recovered exit code + finish instant when present, else the -1/now
 * sentinel for a hard-killed owner (see readBuildTerminal — a successful build
 * whose tracking backend was killed by its own restart must NOT be recorded as
 * failed, and its Duration must reflect the real finish rather than this
 * reconcile pass). Scoped to this namespace: a worktree DB forks main's rows, and
 * reaping those inherited (foreign-pid) builds would surface a phantom "Build
 * failed" in every worktree. Runs on boot, before each claim, and from the
 * boot-adopted watch so a finished-or-crashed owner never wedges the
 * build_runs_inflight_uniq lock.
 */
export async function reconcileOrphanBuilds(): Promise<void> {
  const unfinished = await db
    .select({ id: _buildRuns.id, pid: _buildRuns.pid })
    .from(_buildRuns)
    .where(
      and(
        isNull(_buildRuns.finishedAt),
        eq(_buildRuns.namespace, currentWorktreeName()),
      ),
    );
  if (unfinished.length === 0) return;
  const now = new Date();
  for (const row of unfinished) {
    const terminal = readBuildTerminal(row.id);
    // Leave a genuinely-running build open: no terminal artifact yet AND its
    // owner is still alive.
    if (terminal == null && isPidAlive(row.pid)) continue;
    const { exitCode, finishedAt } = terminal ?? {
      exitCode: -1,
      finishedAt: now,
    };
    // `isNull(finishedAt)` re-checks the row is still open: the CLI stamps its own
    // rows authoritatively at deploy/compose-serve, so a row it closed between the
    // scan above and this write must not be overwritten here. This reconcile is
    // the fallback for rows no live CLI stamp will ever reach.
    await db
      .update(_buildRuns)
      .set({ finishedAt, exitCode })
      .where(and(eq(_buildRuns.id, row.id), isNull(_buildRuns.finishedAt)));
  }
}

// node-postgres surfaces a unique_violation as SQLSTATE 23505. The partial unique
// index build_runs_inflight_uniq throws this when a second in-flight build for the
// namespace is claimed concurrently — the signal that this caller lost the race.
function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "23505";
}

export function triggerBuild(
  trigger: "manual" | "auto",
  opts?: { serveComposition?: string },
): void {
  if (inflight) return;
  inflight = true;
  // Sampled here, outside the async body, so the commit stamped on the ledger
  // row and the baseline `convergeMain` compares against are literally the same
  // value on every exit path below.
  const forCommit = getHeadCommit();
  void runTracked("build:run", async () => {
    let ran = false;
    try {
      if (await hasLiveInflightBuild()) return;
      ran = true;
      await doRunBuild(trigger, forCommit, opts);
    } catch (err) {
      buildLog.publish(
        `Build error: ${err instanceof Error ? err.message : String(err)}`,
        "stderr",
      );
    } finally {
      inflight = false;
      // Only after a build we actually RAN. Converging on the dropped-request
      // path instead would recurse: that path re-enters `triggerBuild`, which
      // drops again (a build is still live), which would converge again. The
      // live build converges for us when it ends.
      if (ran) await convergeMain(forCommit);
    }
  });
}

export function getHeadCommit(): string | null {
  const proc = Bun.spawnSync(["git", "rev-parse", "--short", "HEAD"], {
    cwd: REPO_ROOT,
  });
  if (proc.exitCode !== 0) return null;
  return proc.stdout.toString().trim() || null;
}

/**
 * Auto-build is a CONVERGENCE loop on "main is deployed at refs/heads/main", not
 * a queue of push events. `triggerBuild` DROPS a request that arrives while a
 * build is in flight — and a push landing mid-build is precisely when one does —
 * so the request cannot be remembered, it has to be re-derived. This is that
 * re-derivation, run at every edge where a build reaches terminal.
 *
 * The comparison is against the commit the finished build was FOR, not against
 * the deployed commit, and that is what makes it loop-free in both directions:
 *
 *   - a build that FAILED leaves the deployed commit behind permanently, so
 *     "deployed != head" would rebuild the same failing commit for ever;
 *   - a build that PASSED across a mid-run merge stamps `.build-commit` with the
 *     POST-merge head, so "deployed != head" would call it current when its
 *     artifact was in fact assembled from two different trees.
 *
 * Both are answered by asking whether the tree moved since this build claimed
 * it: it did ⇒ rebuild exactly once from the tip; it didn't ⇒ the verdict stands.
 */
export async function convergeMain(builtCommit: string | null): Promise<void> {
  if (!isMain()) return;
  if (!getConfig(buildConfig).autoBuild) return;
  const head = getHeadCommit();
  if (!needsRebuild(builtCommit, head)) return;
  buildLog.publish(
    `main advanced ${builtCommit} → ${head} during the last build — rebuilding`,
  );
  triggerBuild("auto");
}

/**
 * `convergeMain`'s decision, extracted pure so the property the whole design
 * rests on — that it cannot loop — is testable without the db/config singletons
 * the caller binds. Every re-trigger this returns true for consumes a commit
 * that a subsequent build will then match, so the chain always terminates.
 *
 * An unreadable commit on either side means "cannot tell", which must read as
 * converged: manufacturing a difference from a missing value would mint builds
 * for ever on a checkout where git cannot answer.
 */
export function needsRebuild(
  builtCommit: string | null,
  head: string | null,
): boolean {
  if (builtCommit === null || head === null) return false;
  return head !== builtCommit;
}

async function doRunBuild(
  trigger: "manual" | "auto",
  commitHash: string | null,
  opts?: { serveComposition?: string },
): Promise<void> {
  // A crashed prior owner can leave an unfinished row that the partial unique
  // index treats as a live claim and that would block every future build. Close
  // those dead-owner rows before claiming so a corpse never wedges the lock.
  await reconcileOrphanBuilds();

  const buildStartMs = Date.now();
  const buildId = `build-${buildStartMs}-${Math.random().toString(36).slice(2, 8)}`;

  // Claim the single in-flight slot atomically. Insert *before* spawning so the
  // claiming INSERT — guarded by the build_runs_inflight_uniq partial unique index
  // — is what wins or loses the race, not a check-then-act with a TOCTOU window.
  // Seed pid with this backend's own (live) pid so the row is protected from the
  // orphan reconciler and visible to the durable lock from the instant it exists;
  // it is swapped to the detached child pid below, before the build restarts
  // (kills) this backend. A trigger that lost the race fails here with 23505 and
  // bails without ever starting a second `./singularity build`.
  try {
    await db.insert(_buildRuns).values({
      id: buildId,
      trigger,
      commitHash,
      pid: process.pid,
      namespace: currentWorktreeName(),
    });
  } catch (err) {
    if (isUniqueViolation(err)) return;
    throw err;
  }

  const args = ["./singularity", "build", "--allow-main"];
  if (opts?.serveComposition)
    args.push("--serve-composition", opts.serveComposition);
  const proc = Bun.spawn(args, {
    cwd: REPO_ROOT,
    stdout: "pipe",
    stderr: "pipe",
    detached: true,
    env: {
      ...process.env,
      SINGULARITY_BUILD_ID: buildId,
      SINGULARITY_BUILD_DETACHED: "1",
    },
  });

  await db
    .update(_buildRuns)
    .set({ pid: proc.pid })
    .where(eq(_buildRuns.id, buildId));
  if (trigger === "auto") {
    await recordNotification({
      type: "build",
      title: "Auto-build started",
      description: `Triggered by a new push (${buildId})`,
      variant: "info",
      dedupeKey: `build-start:${buildId}`,
    });
  }

  const allLines: Array<{ text: string; stream: "stdout" | "stderr" }> = [];

  async function streamLines(
    stream: ReadableStream<Uint8Array> | null,
    streamType: "stdout" | "stderr",
  ) {
    if (!stream) return;
    const decoder = new TextDecoder();
    for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) {
      for (const line of decoder.decode(chunk).split("\n")) {
        if (line) {
          buildLog.publish(line, streamType);
          allLines.push({ text: line, stream: streamType });
        }
      }
    }
  }

  await Promise.all([
    streamLines(proc.stdout, "stdout"),
    streamLines(proc.stderr, "stderr"),
  ]);

  const exitCode = await proc.exited;
  buildLog.publish(
    exitCode === 0 ? "Build succeeded" : `Build failed (exit ${exitCode})`,
  );
  // On a main deploy the CLI now stamps main's row itself right after the health
  // probe (before the ~100s compose-serve tail), so by the time this backend
  // observes proc.exited the row is usually already closed. This UPDATE is the
  // fallback for the paths the CLI stamp doesn't cover (a worktree build, or a
  // CLI that died before stamping); the `isNull(finishedAt)` guard below makes it
  // first-writer-wins so it never overwrites the CLI's authoritative close.

  // Sampled once and shared with the recovery below, so the instant on the row
  // and the instant in the artifact are literally the same value.
  const finishedAt = new Date();

  if (exitCode !== 0 && allLines.length > 0) {
    recoverBuildArtifacts({
      worktree: currentWorktreeName(),
      buildId,
      lines: allLines,
      durationMs: finishedAt.getTime() - buildStartMs,
      finishedAt,
      exitCode,
    });
  }

  // The terminal outcome, written once and then READ BACK by the notification
  // arms below through `buildStatusOf` — so the bell and the run's own status
  // badge are derived from the same row by the same function, and cannot drift.
  const outcome = { finishedAt, exitCode };
  await db
    .update(_buildRuns)
    .set(outcome)
    .where(and(eq(_buildRuns.id, buildId), isNull(_buildRuns.finishedAt)));
  frontendHashResource.notify();
  const linkTo = buildDetailRoute.link(agentManagerApp, { runId: buildId });
  if (exitCode === 0) {
    await recordNotification({
      type: "build",
      title: "Build succeeded",
      description: `Completed in ${Math.round((Date.now() - buildStartMs) / 1000)}s`,
      variant: "success",
      linkTo,
      dedupeKey: `build-finish:${buildId}`,
    });
  } else if (exitCode === BUILD_EXIT_SUPERSEDED) {
    // Not a failure and not an alarm: the tree moved under this build, so it had
    // nothing left to be a verdict about. `convergeMain` below mints the rebuild.
    await recordNotification({
      type: "build",
      title: "Build superseded",
      description: `${commitHash ?? "the built commit"} was replaced mid-build — rebuilding`,
      variant: "info",
      linkTo,
      dedupeKey: `build-finish:${buildId}`,
    });
  } else if (buildStatusOf(outcome) === "killed") {
    // Also not a failure and not an alarm: a signal arrived from outside the
    // build — a human, a supervisor, another agent — which says nothing about
    // the code. Before this arm the else-branch below swallowed it as "Build
    // failed", which is what made the 2026-08-06 kill read as a code defect.
    // The status comes from `buildStatusOf`, never from the raw code, so the
    // notification can never disagree with the badge on the run's own page.
    await recordNotification({
      type: "build",
      title: "Build ended from outside",
      description: `${killedSignalName(exitCode)} arrived after ${Math.round((Date.now() - buildStartMs) / 1000)}s — see the run for who sent it`,
      variant: "info",
      linkTo,
      dedupeKey: `build-finish:${buildId}`,
    });
  } else {
    await recordNotification({
      type: "build",
      title: "Build failed",
      description: `Exited with code ${exitCode} after ${Math.round((Date.now() - buildStartMs) / 1000)}s`,
      variant: "error",
      linkTo,
      dedupeKey: `build-finish:${buildId}`,
    });
  }
}
