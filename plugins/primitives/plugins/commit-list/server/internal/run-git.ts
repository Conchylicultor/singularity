import { GIT } from "@plugins/infra/plugins/paths/server";

/**
 * Thrown by {@link runGit} when a git invocation exits non-zero. Carries the
 * full context (args, cwd, exit code, captured stderr) so the failure is
 * debuggable rather than an absorbable `null`.
 */
export class GitError extends Error {
  readonly args: string[];
  readonly cwd: string;
  readonly exitCode: number;
  readonly stderr: string;

  constructor(opts: {
    args: string[];
    cwd: string;
    exitCode: number;
    stderr: string;
  }) {
    super(
      `git ${opts.args.join(" ")} (cwd: ${opts.cwd}) exited ${opts.exitCode}: ${opts.stderr.trim()}`,
    );
    this.name = "GitError";
    this.args = opts.args;
    this.cwd = opts.cwd;
    this.exitCode = opts.exitCode;
    this.stderr = opts.stderr;
  }
}

/**
 * Discriminated result of a git invocation. Use {@link tryRunGit} (over
 * {@link runGit}) only when a non-zero exit is a legitimate answer the caller
 * must branch on — e.g. probing whether a ref exists, `git merge-base` exiting
 * 1 for "no common ancestor", or an exit-code-as-signal command like
 * `git diff --no-index` / `--exit-code` (exit 1 = "differs", with the diff on
 * stdout). Everywhere else, prefer `runGit` and let the throw propagate.
 *
 * `stdout` is present on BOTH variants: the exit-code-as-signal commands emit
 * their payload on stdout while exiting non-zero, so dropping stdout on failure
 * would force those callers back into ad-hoc local git spawns. `stderr` is
 * carried on the failure variant so {@link runGit}'s thrown {@link GitError}
 * message stays debuggable.
 */
export type GitResult =
  | { ok: true; stdout: string }
  | { ok: false; exitCode: number; stdout: string; stderr: string };

/**
 * Probe variant: runs git and returns a discriminated result, never throwing
 * on a non-zero exit. The caller inspects `.ok` and branches.
 */
export async function tryRunGit(
  args: string[],
  cwd: string,
): Promise<GitResult> {
  const proc = Bun.spawn([GIT, "--no-optional-locks", "-C", cwd, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return exitCode === 0
    ? { ok: true, stdout }
    : { ok: false, exitCode, stdout, stderr };
}

/**
 * Runs git and returns stdout, throwing {@link GitError} on any non-zero exit.
 * This is the default: a git failure is never conflated with an empty/absent
 * result. Reach for {@link tryRunGit} only for genuine probe semantics.
 */
export async function runGit(args: string[], cwd: string): Promise<string> {
  const result = await tryRunGit(args, cwd);
  if (!result.ok) {
    throw new GitError({
      args,
      cwd,
      exitCode: result.exitCode,
      stderr: result.stderr,
    });
  }
  return result.stdout;
}
