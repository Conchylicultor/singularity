import { Log } from "@plugins/logs/server/api";

const buildLog = Log.channel("build");

export async function runBuild(): Promise<number> {
  const proc = Bun.spawn(["./singularity", "build", "--no-restart", "--allow-main"], {
    cwd: import.meta.dir + "/../../../..",
    stdout: "pipe",
    stderr: "pipe",
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
