import { copyFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { Log } from "@plugins/debug/plugins/logs/server";
import { REPO_ROOT, SINGULARITY_DIR } from "@plugins/infra/plugins/paths/server";
import { _buildRuns } from "./tables";
import { buildHistoryResource } from "./build-history-resource";
import { frontendHashResource } from "./frontend-hash-resource";

const buildLog = Log.channel("build");

let inflight = false;

export function isBuildInflight(): boolean {
  return inflight;
}

export function triggerBuild(trigger: "manual" | "auto"): void {
  if (inflight) return;
  inflight = true;
  doRunBuild(trigger)
    .catch((err) => {
      buildLog.publish(`Build error: ${err?.message ?? err}`, "stderr");
    })
    .finally(() => {
      inflight = false;
    });
}

function getHeadCommit(): string | null {
  const proc = Bun.spawnSync(["git", "rev-parse", "--short", "HEAD"], { cwd: REPO_ROOT });
  if (proc.exitCode !== 0) return null;
  return proc.stdout.toString().trim() || null;
}

async function doRunBuild(trigger: "manual" | "auto"): Promise<void> {
  const buildId = `build-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const commitHash = getHeadCommit();

  await db.insert(_buildRuns).values({ id: buildId, trigger, commitHash });
  buildHistoryResource.notify();

  const proc = Bun.spawn(["./singularity", "build", "--allow-main"], {
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

  streamLines(proc.stdout, "stdout").catch(() => {});
  streamLines(proc.stderr, "stderr").catch(() => {});

  const exitCode = await proc.exited;
  buildLog.publish(exitCode === 0 ? "Build succeeded" : `Build failed (exit ${exitCode})`);

  const worktreeName = process.env.SINGULARITY_WORKTREE;
  if (worktreeName) {
    const profileDir = join(SINGULARITY_DIR, "worktrees");
    const src = join(profileDir, `${worktreeName}-build-profile.json`);
    const dst = join(profileDir, `${worktreeName}-build-profile-${buildId}.json`);
    try { copyFileSync(src, dst); } catch { /* no profile written — that's fine */ }

    const logsSrc = join(profileDir, `${worktreeName}-build-logs.json`);
    const logsDst = join(profileDir, `${worktreeName}-build-logs-${buildId}.json`);
    try { copyFileSync(logsSrc, logsDst); } catch { /* no logs written — that's fine */ }
  }

  await db
    .update(_buildRuns)
    .set({ finishedAt: new Date(), exitCode })
    .where(eq(_buildRuns.id, buildId));
  buildHistoryResource.notify();
  frontendHashResource.notify();
}
