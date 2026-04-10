import { Log } from "@plugins/logs/server/api";

const buildLog = Log.channel("build");

export async function handleBuild(_req: Request): Promise<Response> {
  const proc = Bun.spawn(["bun", "run", "build"], {
    cwd: import.meta.dir + "/../../../web",
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

  return Response.json({ exitCode });
}
