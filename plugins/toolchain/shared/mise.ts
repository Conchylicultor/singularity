import { existsSync } from "fs";
import { dirname, join } from "path";
import { spawnCaptured } from "@plugins/infra/plugins/spawn/core";
import { HOME_DIR } from "@plugins/infra/plugins/paths/core";

/**
 * The `mise` binary. Looked up on PATH, then at its installer's default
 * location — an agent shell often has mise's shims on PATH but not mise itself.
 */
function miseBin(): string {
  const onPath = Bun.which("mise");
  if (onPath !== null) return onPath;
  const installed = join(HOME_DIR, ".local", "bin", "mise");
  if (existsSync(installed)) return installed;
  throw new Error(
    `mise is not installed (not on PATH, not at ${installed}). Install it: https://mise.jdx.dev`,
  );
}

/**
 * Runs `mise <args>` for the checkout at `root`, seeing ONLY that checkout's
 * config.
 *
 * `MISE_CEILING_PATHS` is load-bearing. A worktree lives inside the main
 * checkout (`<main>/.claude/worktrees/<wt>`), so mise also loads main's
 * `mise.toml` as a parent config — and `mise lock` run in a worktree rewrites
 * the PARENT's lock too, moving main's toolchain to whatever this worktree just
 * installed. Verified on mise 2026.4.28: a child `mise lock` changed the
 * parent's go from 1.24.13 to 1.27.1. The ceiling stops the walk at the
 * worktree's own directory.
 */
export async function mise(
  root: string,
  args: string[],
  timeoutMs: number,
): Promise<string> {
  const argv = [miseBin(), ...args];
  const result = await spawnCaptured(argv, {
    cwd: root,
    env: { ...process.env, MISE_CEILING_PATHS: dirname(root) },
    timeoutMs,
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `\`mise ${args.join(" ")}\` failed (exit ${result.exitCode}${result.timedOut ? ", timed out" : ""}):\n` +
        `${result.stdout}\n${result.stderr}`.trim(),
    );
  }
  return result.stdout;
}
