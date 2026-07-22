import { backgroundArgv } from "@plugins/packages/plugins/spawn-priority/core";
import type { SpawnPassthroughOptions, SpawnPassthroughResult } from "./types";

/**
 * Run a child to completion with stdout/stderr INHERITED (the child writes
 * straight to the parent's terminal — no JS streams, nothing to wedge) and
 * stdin ignored. For the exec-shaped sites: build steps, the push flow's
 * subprocesses, self re-execs.
 *
 * A non-zero exit is a RESULT — callers branch (most `process.exit(1)`).
 * `onSpawn` exposes `{ pid, kill }` synchronously for signal forwarding
 * (e.g. inspect.ts relaying SIGINT/SIGTERM to its re-exec).
 */
export async function spawnPassthrough(
  argv: string[],
  opts: SpawnPassthroughOptions = {},
): Promise<SpawnPassthroughResult> {
  const proc = Bun.spawn(opts.background ? backgroundArgv(argv) : argv, {
    cwd: opts.cwd,
    env: opts.env,
    stdin: "ignore",
    stdout: "inherit",
    stderr: "inherit",
  });
  opts.onSpawn?.({ pid: proc.pid, kill: (signal) => proc.kill(signal) });
  const exitCode = await proc.exited;
  return {
    exitCode,
    signalCode: proc.signalCode,
    resourceUsage: { maxRssBytes: proc.resourceUsage()?.maxRSS },
  };
}
