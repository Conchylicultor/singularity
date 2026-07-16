import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { runTracked } from "@plugins/infra/plugins/runtime-profiler/core";
import { REPO_ROOT, currentWorktreeName, worktreeDataDir, worktreeArtifacts, pruneWorktreeBuildArtifacts } from "@plugins/infra/plugins/paths/server";
import { recordNotification } from "@plugins/shell/plugins/notifications/server";
import { buildDetailRoute } from "@plugins/build/core";
import { agentManagerApp } from "@plugins/apps/plugins/agent-manager/plugins/shell/core";
import { _buildRuns } from "./tables";
import { frontendHashResource } from "./frontend-hash-resource";
import { buildLog } from "./build-log";

// In-process re-entry guard only. The authoritative, restart-durable lock lives
// in the DB (see isAnyBuildAlive) — `./singularity build` restarts this very
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
 */
async function isAnyBuildAlive(): Promise<boolean> {
  const rows = await db
    .select({ pid: _buildRuns.pid })
    .from(_buildRuns)
    .where(and(isNull(_buildRuns.finishedAt), eq(_buildRuns.namespace, currentWorktreeName())));
  return rows.some((r) => isPidAlive(r.pid));
}

/**
 * Recover the *true* terminal exit code of an orphaned build from the durable
 * per-build log the detached `./singularity build` writes (build-logs-<id>.json).
 *
 * An auto-build from main restarts *this very backend* mid-build, so the process
 * that spawned the build (and `await`s `proc.exited`) is routinely SIGTERM-killed
 * before it can record the result — while the build CLI itself survives the
 * restart and runs to completion. Without consulting its artifact we'd blindly
 * stamp every such row exit=-1, turning a fully successful deploy into a phantom
 * "Build failed" (the build button then shows red even though the app updated).
 *
 * The CLI writes this file on both terminal paths: full success (every step
 * green) and a checks/vite step failure (the failing step carries success=false).
 * A dead owner pid guarantees the CLI is past its log-writing point, so there is
 * no read/write race. Absent file ⇒ no clean terminal signal (a hard SIGKILL, or
 * a post-publish boot/health-probe failure that exits before the log is written)
 * ⇒ keep the -1 failure sentinel.
 */
function resolveOrphanExitCode(buildId: string): number {
  const name = currentWorktreeName();
  const path = worktreeArtifacts.buildLogs(name, buildId);
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as {
      steps?: Array<{ success: boolean }>;
    };
    const steps = parsed.steps ?? [];
    if (steps.length === 0) return -1;
    return steps.every((s) => s.success) ? 0 : 1;
  } catch (err) {
    if (
      (err as NodeJS.ErrnoException).code !== "ENOENT" &&
      !(err instanceof SyntaxError)
    )
      throw err;
    return -1;
  }
}

/**
 * Close any unfinished build_runs rows for this namespace whose owning process is
 * dead, stamping the build's recovered exit code (see resolveOrphanExitCode — a
 * successful build whose tracking backend was killed by its own restart must NOT
 * be recorded as failed). Scoped to this namespace: a worktree DB forks main's
 * rows, and reaping those inherited (foreign-pid) builds would surface a phantom
 * "Build failed" in every worktree. Runs on boot and before each claim so a
 * crashed owner never permanently wedges the build_runs_inflight_uniq lock.
 */
export async function reconcileOrphanBuilds(): Promise<void> {
  const unfinished = await db
    .select({ id: _buildRuns.id, pid: _buildRuns.pid })
    .from(_buildRuns)
    .where(and(isNull(_buildRuns.finishedAt), eq(_buildRuns.namespace, currentWorktreeName())));
  const orphans = unfinished.filter((r) => !isPidAlive(r.pid));
  if (orphans.length === 0) return;
  const finishedAt = new Date();
  for (const orphan of orphans) {
    await db
      .update(_buildRuns)
      .set({ finishedAt, exitCode: resolveOrphanExitCode(orphan.id) })
      .where(eq(_buildRuns.id, orphan.id));
  }
}

// node-postgres surfaces a unique_violation as SQLSTATE 23505. The partial unique
// index build_runs_inflight_uniq throws this when a second in-flight build for the
// namespace is claimed concurrently — the signal that this caller lost the race.
function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "23505";
}

export function triggerBuild(trigger: "manual" | "auto"): void {
  if (inflight) return;
  inflight = true;
  void runTracked("build:run", async () => {
    try {
      if (await isAnyBuildAlive()) return;
      await doRunBuild(trigger);
    } catch (err) {
      buildLog.publish(
        `Build error: ${err instanceof Error ? err.message : String(err)}`,
        "stderr",
      );
    } finally {
      inflight = false;
    }
  });
}

function getHeadCommit(): string | null {
  const proc = Bun.spawnSync(["git", "rev-parse", "--short", "HEAD"], { cwd: REPO_ROOT });
  if (proc.exitCode !== 0) return null;
  return proc.stdout.toString().trim() || null;
}

async function doRunBuild(trigger: "manual" | "auto"): Promise<void> {
  // A crashed prior owner can leave an unfinished row that the partial unique
  // index treats as a live claim and that would block every future build. Close
  // those dead-owner rows before claiming so a corpse never wedges the lock.
  await reconcileOrphanBuilds();

  const buildStartMs = Date.now();
  const buildId = `build-${buildStartMs}-${Math.random().toString(36).slice(2, 8)}`;
  const commitHash = getHeadCommit();

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

  const proc = Bun.spawn(["./singularity", "build", "--allow-main"], {
    cwd: REPO_ROOT,
    stdout: "pipe",
    stderr: "pipe",
    detached: true,
    env: { ...process.env, SINGULARITY_BUILD_ID: buildId, SINGULARITY_BUILD_DETACHED: "1" },
  });

  await db.update(_buildRuns).set({ pid: proc.pid }).where(eq(_buildRuns.id, buildId));
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
  buildLog.publish(exitCode === 0 ? "Build succeeded" : `Build failed (exit ${exitCode})`);

  if (exitCode !== 0 && allLines.length > 0) {
    const worktreeName = process.env.SINGULARITY_WORKTREE;
    if (worktreeName) {
      const worktreeDir = worktreeDataDir(worktreeName);
      mkdirSync(worktreeDir, { recursive: true });
      const logPath = worktreeArtifacts.buildLogs(worktreeName, buildId);
      if (!existsSync(logPath)) {
        const tmp = `${logPath}.tmp.${process.pid}`;
        const logs = {
          steps: [{
            id: "raw",
            label: "Build Output",
            lines: allLines,
            durationMs: Date.now() - buildStartMs,
            success: false,
          }],
        };
        writeFileSync(tmp, JSON.stringify(logs) + "\n");
        renameSync(tmp, logPath);
      }
      // A build the backend had to recover (mid-build restart) may never have
      // reached the CLI's own prune, so cap this namespace's artifacts here too.
      pruneWorktreeBuildArtifacts(worktreeName);
    }
  }

  await db
    .update(_buildRuns)
    .set({ finishedAt: new Date(), exitCode })
    .where(eq(_buildRuns.id, buildId));
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
