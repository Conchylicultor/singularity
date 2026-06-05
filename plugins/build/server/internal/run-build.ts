import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { REPO_ROOT, SINGULARITY_DIR, currentWorktreeName } from "@plugins/infra/plugins/paths/server";
import { recordNotification } from "@plugins/notifications/server";
import { _buildRuns } from "./tables";
import { buildHistoryResource } from "./build-history-resource";
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

export function triggerBuild(trigger: "manual" | "auto"): void {
  if (inflight) return;
  inflight = true;
  void (async () => {
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
  })();
}

function getHeadCommit(): string | null {
  const proc = Bun.spawnSync(["git", "rev-parse", "--short", "HEAD"], { cwd: REPO_ROOT });
  if (proc.exitCode !== 0) return null;
  return proc.stdout.toString().trim() || null;
}

async function doRunBuild(trigger: "manual" | "auto"): Promise<void> {
  const buildStartMs = Date.now();
  const buildId = `build-${buildStartMs}-${Math.random().toString(36).slice(2, 8)}`;
  const commitHash = getHeadCommit();

  // Spawn before inserting so the row carries the child pid from the start: the
  // pid is what marks this run as in-flight for the durable lock and protects it
  // from the orphan reconciler, both of which can fire the instant the row exists.
  const proc = Bun.spawn(["./singularity", "build", "--allow-main"], {
    cwd: REPO_ROOT,
    stdout: "pipe",
    stderr: "pipe",
    detached: true,
    env: { ...process.env, SINGULARITY_BUILD_ID: buildId },
  });

  await db
    .insert(_buildRuns)
    .values({ id: buildId, trigger, commitHash, pid: proc.pid, namespace: currentWorktreeName() });
  buildHistoryResource.notify();
  if (trigger === "auto") {
    await recordNotification({
      type: "build",
      title: "Auto-build triggered by new push",
      description: "Auto-build triggered by new push",
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
      const worktreeDir = join(SINGULARITY_DIR, "worktrees", worktreeName);
      mkdirSync(worktreeDir, { recursive: true });
      const logPath = join(worktreeDir, `build-logs-${buildId}.json`);
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
    }
  }

  await db
    .update(_buildRuns)
    .set({ finishedAt: new Date(), exitCode })
    .where(eq(_buildRuns.id, buildId));
  buildHistoryResource.notify();
  frontendHashResource.notify();
  const linkTo = `/build/r/${buildId}`;
  if (exitCode === 0) {
    await recordNotification({
      type: "build",
      title: "Build succeeded",
      description: "Build succeeded",
      variant: "success",
      linkTo,
      dedupeKey: `build-finish:${buildId}`,
    });
  } else {
    await recordNotification({
      type: "build",
      title: `Build failed (exit ${exitCode})`,
      description: `Build failed (exit ${exitCode})`,
      variant: "error",
      linkTo,
      dedupeKey: `build-finish:${buildId}`,
    });
  }
}
