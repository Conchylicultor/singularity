/**
 * `reexecAfterInstall()` — hand this invocation to a FRESH process once
 * `ensureDeps()` has actually installed, because the installing process can
 * never see what it installed.
 *
 * THE BUG THIS EXISTS FOR (reproduced deterministically, bun 1.3.13):
 *
 *     $ ./singularity push          # in a worktree with no node_modules
 *     … bun install … 2542 packages installed
 *     error: Cannot find package 'commander' from '…/cli/bin/cli.ts'
 *     $ ./singularity push          # retry, no changes → works
 *
 * Bun's module resolver CACHES DIRECTORY LISTINGS, and starts populating them as
 * it loads this process's first modules — well before `ensureDeps()` runs. Every
 * ancestor of `bin/` is walked looking for a `node_modules` and cached as having
 * none, `plugins/framework/plugins/cli/` among them. `ensureDeps()` then creates
 * exactly that directory from a `bun install` SUBPROCESS, whose writes the
 * parent's cache never learns about, and the subsequent `await import("./cli")`
 * re-walks the stale listing.
 *
 * `commander` is a workspace-local dependency of `plugins/framework/plugins/cli`
 * rather than a hoisted root one, which is why it is the package that fails:
 * measured on bun 1.3.13, a package installed into an ANCESTOR directory of the
 * importer is not seen, while one installed into the importer's own directory
 * is. Every workspace-local dependency in this repo has the first shape.
 *
 * It is NOT a race — nothing is concurrent, and there is no window to lose. It
 * is deterministic: EVERY invocation whose install has to create a
 * workspace-local `node_modules` dies this way, and only the retry works,
 * because by then the stamp is fresh and no install runs. Fresh clone, fresh
 * worktree and `rm -rf node_modules` are all that path — i.e. precisely the case
 * `ensureDeps` exists to serve.
 *
 * The dynamic `await import("./cli")` was believed to be sufficient (see
 * `bin/index.ts`'s import-constraint docblock and the `cli:bootstrap-package-free`
 * check). It is necessary but NOT sufficient: it fixes WHEN resolution happens —
 * after the install rather than hoisted above it — while this fixes WHICH
 * PROCESS resolves. A cache populated before the install is stale whenever it is
 * read, so no amount of ordering inside one process can help.
 *
 * Hence the rule, which is about processes and not about imports: **the process
 * that runs the install must not go on to resolve an npm package.** It re-execs
 * instead, and the fresh process — whose resolver cache postdates the install —
 * runs the user's actual command. The cost lands only on the install path (one
 * extra process start, against a 10–25 s install); the common fresh-stamp case
 * never reaches this module.
 */
import { spawnPassthrough } from "@plugins/infra/plugins/spawn/core";

/**
 * Re-exec budget carried across process generations. Present ⇒ this process IS
 * a re-exec, and its value is how many happened before it.
 */
export const REEXEC_ENV = "SINGULARITY_DEPS_REEXEC";

/**
 * At most two hand-offs per user invocation. One covers the bug above. The
 * second covers a re-exec whose own `ensureDeps` installed AGAIN — real in this
 * repo, where agents share a checkout and the provision registry is itself a dep
 * input, so a concurrent build can move the signature between our install and
 * the child's re-check. Beyond that the inputs are churning faster than we can
 * install them, and spawning forever would turn a transient condition into an
 * unkillable fork bomb; we stop and let the command run, so the outcome is a
 * real result (or a loud module error) rather than an infinite loop.
 */
const MAX_REEXECS = 2;

/**
 * Discriminated so "we did not re-exec" is a state the caller must branch on,
 * carrying WHY — never a bare boolean whose false arm reads as success.
 */
export type ReexecOutcome =
  { reexeced: true; exitCode: number } | { reexeced: false; reason: string };

export interface ReexecOptions {
  /** Defaults to `process.argv.slice(2)` — the user's subcommand and flags. */
  args?: string[];
  /** Defaults to `process.env`. */
  env?: Record<string, string | undefined>;
  /**
   * @internal TEST SEAM. Overrides how the child is run so the suite can assert
   * the argv, the env hand-off and the budget without starting a real bun.
   * Production callers pass nothing. Mirrors `ensureDeps`'s `installer` seam.
   */
  spawn?: (
    argv: string[],
    env: Record<string, string | undefined>,
  ) => Promise<{ exitCode: number }>;
}

/** How many re-execs already happened, from the inherited env. */
function priorReexecs(env: Record<string, string | undefined>): number {
  const raw = env[REEXEC_ENV];
  if (raw === undefined) return 0;
  const n = Number.parseInt(raw, 10);
  // A garbled value is treated as "budget spent", never as 0: the loop bound is
  // the whole point of the counter, and an unparseable one must not silently
  // hand back an unbounded budget.
  return Number.isInteger(n) && n >= 0 ? n : MAX_REEXECS;
}

function runChild(
  argv: string[],
  env: Record<string, string | undefined>,
): Promise<{ exitCode: number }> {
  // stdin INHERITED: this child is the user's command, so it must be
  // indistinguishable from the process they invoked — see the option's docblock.
  //
  // No signal forwarding, deliberately. The child is in this process's group, so
  // an interactive Ctrl-C reaches both. A SIGTERM aimed at us alone (the
  // wrapper's orphan kill) leaves the child briefly parentless, and its own
  // orphan guard — armed by the same bootstrap, from the same argv — reaps it on
  // the next 2 s tick. That is the guarantee the guard already provides for
  // every op; adding a second, racing kill path here would not improve it.
  return spawnPassthrough([process.execPath, ...argv], {
    env,
    stdin: "inherit",
  });
}

/**
 * Re-run this invocation in a fresh process. `entry` is the bootstrap's own
 * absolute path (`import.meta.path` at the call site) rather than
 * `process.argv[1]`, which is relative to a cwd the child does not necessarily
 * share.
 *
 * Returns `{ reexeced: true, exitCode }` — the caller exits with that code — or
 * `{ reexeced: false, reason }` when the budget is spent.
 */
export async function reexecAfterInstall(
  entry: string,
  opts: ReexecOptions = {},
): Promise<ReexecOutcome> {
  const env = opts.env ?? process.env;
  const args = opts.args ?? process.argv.slice(2);
  const spawn = opts.spawn ?? runChild;

  const prior = priorReexecs(env);
  if (prior >= MAX_REEXECS) {
    return {
      reexeced: false,
      reason:
        `dependencies were installed again after ${prior} re-exec(s) — not re-exec'ing further. ` +
        `Something is changing this checkout's dependency inputs concurrently (another agent's ` +
        `build?). Continuing in this process; if it dies on an unresolved module, that is the ` +
        `install this process cannot see — just run the command again.`,
    };
  }

  const { exitCode } = await spawn([entry, ...args], {
    ...env,
    [REEXEC_ENV]: String(prior + 1),
  });
  return { reexeced: true, exitCode };
}
