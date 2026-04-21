import { Log } from "@plugins/debug/plugins/logs/server";

const buildLog = Log.channel("build");

// In-process mutex. Coalesces overlapping runBuild() calls onto a single
// `./singularity build` invocation. Every call site (auto-build-watcher,
// POST /api/build) goes through this, so none of them can spawn a second
// vite run in parallel with an in-flight one.
let inflight: Promise<number> | null = null;

export function isBuildInflight(): boolean {
  return inflight !== null;
}

export function runBuild(): Promise<number> {
  if (inflight) return inflight;
  inflight = doRunBuild().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function doRunBuild(): Promise<number> {
  // Detach into a new session so gateway's process-group SIGKILL on idle-sweep
  // doesn't kill the build mid-flight. The CLI itself uses a filesystem lock
  // and atomic-rename publish, so even across restarts web/dist stays whole.
  const proc = Bun.spawn(["./singularity", "build", "--no-restart", "--allow-main"], {
    cwd: import.meta.dir + "/../../../..",
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
