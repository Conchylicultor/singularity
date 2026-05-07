import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { Log } from "@plugins/debug/plugins/logs/server";
import { REPO_ROOT } from "@plugins/infra/plugins/paths/server";
import { _buildRuns } from "./tables";
import { buildHistoryResource } from "./build-history-resource";

const buildLog = Log.channel("build");

// In-process mutex. Coalesces overlapping runBuild() calls onto a single
// `./singularity build` invocation. Every call site (build.run job,
// POST /api/build) goes through this, so none of them can spawn a second
// vite run in parallel with an in-flight one.
let inflight: Promise<number> | null = null;

export function isBuildInflight(): boolean {
  return inflight !== null;
}

export function runBuild(trigger: "manual" | "auto" = "auto"): Promise<number> {
  if (inflight) return inflight;
  inflight = doRunBuild(trigger).finally(() => {
    inflight = null;
  });
  return inflight;
}

function getHeadCommit(): string | null {
  const proc = Bun.spawnSync(["git", "rev-parse", "--short", "HEAD"], { cwd: REPO_ROOT });
  if (proc.exitCode !== 0) return null;
  return proc.stdout.toString().trim() || null;
}

async function doRunBuild(trigger: "manual" | "auto"): Promise<number> {
  const buildId = `build-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const commitHash = getHeadCommit();

  await db.insert(_buildRuns).values({ id: buildId, trigger, commitHash });
  buildHistoryResource.notify();

  // Detach into a new session so gateway's process-group SIGKILL on idle-sweep
  // doesn't kill the build mid-flight. The CLI itself uses a filesystem lock
  // and atomic-rename publish, so even across restarts web/dist stays whole.
  const proc = Bun.spawn(["./singularity", "build", "--no-restart", "--allow-main"], {
    cwd: REPO_ROOT,
    stdout: "pipe",
    stderr: "pipe",
    detached: true,
  });

  const decoder = new TextDecoder();

  async function streamLines(
    stream: ReadableStream<Uint8Array> | null,
    streamType: "stdout" | "stderr",
  ) {
    if (!stream) return;
    for await (const chunk of stream) {
      for (const line of decoder.decode(chunk).split("\n")) {
        if (line) buildLog.publish(line, streamType);
      }
    }
  }

  await Promise.all([
    streamLines(proc.stdout, "stdout"),
    streamLines(proc.stderr, "stderr"),
  ]);

  const exitCode = await proc.exited;
  buildLog.publish(exitCode === 0 ? "Build succeeded" : `Build failed (exit ${exitCode})`);

  await db
    .update(_buildRuns)
    .set({ finishedAt: new Date(), exitCode })
    .where(eq(_buildRuns.id, buildId));
  buildHistoryResource.notify();

  if (exitCode === 0) {
    const worktree = process.env.SINGULARITY_WORKTREE;
    if (worktree) {
      buildLog.publish("Restarting backend...");
      fetch(`http://localhost:9000/gateway/worktrees/${worktree}/restart`, {
        method: "POST",
      }).catch(() => {});
    }
  }

  return exitCode;
}
