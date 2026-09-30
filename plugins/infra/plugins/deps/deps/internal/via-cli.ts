import { join } from "node:path";
import {
  spawnCaptured,
  spawnPassthrough,
} from "@plugins/infra/plugins/spawn/core";
import { REPO_ROOT } from "@plugins/infra/plugins/paths/core";
import type { Dep, DepSource, Ready } from "./dep";
import { readyNow } from "./ensure";

/** Longest the child install may take: the biggest install is a browser (~280 MB). */
const INSTALL_TIMEOUT_MS = 30 * 60_000;

/**
 * `dep` installed, for a host process that holds no `ExecContext` and must
 * not mint one: a check (running inside an op that already holds its host
 * grant, where an in-process `exec.admit` could wait on itself) and an e2e
 * script. The install runs in a CHILD, `./singularity deps install <id>` —
 * a CLI process of its own with its own `cliExecContext`, admitted to the host
 * like any other install, under the same host flock — and the proof is then
 * read back with `readyNow`.
 *
 * - Already installed: one `readyNow`, no child.
 * - `stdio: "inherit"` streams the child's progress to this process's
 *   terminal (an e2e run someone is watching); `"capture"` keeps it, and puts
 *   its tail in the error (a check, whose output is a verdict).
 *
 * Never from a backend: a request path uses `readyNow` + `requestDep`, and a
 * supervised job's run body has `ctx.exec` for `ensureDep`.
 */
export async function ensureDepViaCli<S extends DepSource>(
  dep: Dep<S>,
  opts: { stdio: "inherit" | "capture"; root?: string },
): Promise<Ready<S>> {
  const root = opts.root ?? REPO_ROOT;
  const before = await readyNow(dep, { root });
  if (before.kind === "ready") return before.ready;

  const argv = [join(root, "singularity"), "deps", "install", dep.id];
  let failure: string | null = null;
  if (opts.stdio === "inherit") {
    // The child's own output (the engine's lines, the installer's) says what
    // it is doing; nothing to add here.
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    try {
      const { exitCode, signalCode } = await spawnPassthrough(argv, {
        cwd: root,
        onSpawn: ({ kill }) => {
          timer = setTimeout(() => {
            timedOut = true;
            kill("SIGTERM");
          }, INSTALL_TIMEOUT_MS);
        },
      });
      if (timedOut) {
        failure = `did not finish within ${INSTALL_TIMEOUT_MS / 60_000} minutes (killed)`;
      } else if (exitCode !== 0) {
        failure = `exited ${exitCode}${signalCode ? ` (${signalCode})` : ""}; its output is above`;
      }
    } finally {
      clearTimeout(timer);
    }
  } else {
    const res = await spawnCaptured(argv, {
      cwd: root,
      mergeStderr: true,
      timeoutMs: INSTALL_TIMEOUT_MS,
    });
    if (res.exitCode !== 0 || res.timedOut) {
      const tail = res.stdout.trim().split("\n").slice(-20).join("\n");
      failure = `${res.timedOut ? "timed out" : `exited ${res.exitCode}`}:\n${tail}`;
    }
  }
  if (failure !== null) {
    throw new Error(`${argv.slice(1).join(" ")} ${failure}`);
  }

  const after = await readyNow(dep, { root });
  if (after.kind !== "ready") {
    throw new Error(
      `${argv.slice(1).join(" ")} succeeded, yet ${dep.id} reads ${after.kind}${after.kind === "failed" ? `: ${after.message}` : ""}`,
    );
  }
  return after.ready;
}
