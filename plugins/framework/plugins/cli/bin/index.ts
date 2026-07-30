import { installOrphanGuard, isOpCommand, ORPHAN_EXIT_CODE } from "./orphan-guard";
import { ensureDeps } from "./ensure-deps";

/**
 * `./singularity`'s entrypoint — and deliberately NOT the CLI. Three ordered
 * steps that must all be able to run with `node_modules` absent or stale:
 *
 *   1. arm the orphan guard
 *   2. `await ensureDeps()`   — this checkout's `node_modules` is correct
 *   3. `await import("./cli")` — the commander program, from ./cli.ts
 *
 * WHY THIS FILE EXISTS. The wrapper used to be:
 *
 *   set -e; cd "$(dirname "$0")"; bun install --silent; exec bun …/bin/index.ts "$@"
 *
 * `bun install` can genuinely fail (bun 1.3.13 has no install mutex, so two
 * concurrent installs in one checkout race on `clonefileat` and one loses).
 * `set -e` then aborted the wrapper before `exec`, and `--silent` meant nothing
 * was printed: every subcommand looked like it had failed on its own, with exit
 * 1 and zero bytes of output — `./singularity check` reading as "checks failed"
 * when no check ever ran. The fix is structural rather than better error
 * handling in shell: there is now NO step before the CLI process, so no step can
 * die before the CLI. The wrapper is a bare `exec`, and the install lives here,
 * inside a process that can attribute its own failures.
 *
 * THE IMPORT CONSTRAINT (the load-bearing part). This module's transitive
 * *static* import set must reach **no npm package** — node builtins, relative
 * repo files and `@plugins/*` aliases only. Static imports are hoisted above
 * every statement in the module, so a single `import { program } from
 * "commander"` here would resolve `commander` out of the very `node_modules`
 * that step 2 exists to repair — the fresh-checkout case would crash on an
 * unresolved module, which is the same class of pre-CLI death this whole file
 * removes. `commander` is exactly why `./cli.ts` exists, and why step 3 is a
 * *dynamic* import: it is the one form that resolves only after step 2 has
 * returned. Enforced by the `cli:bootstrap-package-free` check (the transitive
 * closure is measured with `Bun.build`, so it cannot drift from what actually
 * loads) — if you need a package, put the import in `./cli.ts`.
 *
 * Both current imports satisfy the constraint: `./orphan-guard` has zero imports
 * of its own, and `./ensure-deps` is written under the same rule (see its
 * docblock).
 */

// A long-running op runs in THIS process, whose ppid is the invoking shell —
// so it observes its own orphaning directly. Terminate when that shell dies, so
// an orphaned op never holds a host lock (the push mutex worst case) forever.
//
// FIRST, before the install: the guard must be armed for the whole lifetime of
// this process, install included, or an orphaned op could sit on the install
// lock — the one lock every other CLI invocation in this checkout queues behind.
// `process.argv[2]` is still the subcommand (`bun bin/index.ts <cmd>`).
if (isOpCommand(process.argv[2])) {
  installOrphanGuard(() => process.exit(ORPHAN_EXIT_CODE));
}

// The one dependency chokepoint: freshness-gated (the common case is ~140 ms and
// silent — see its docblock for the measured breakdown), serialized against
// every other CLI-mediated install, and loud. On
// failure it throws a message written to be the entire story — which phase
// failed, the likely cause, and what to do — so print the message and stop.
// Deliberately no stack: the stack would name this bootstrap, not the problem.
try {
  await ensureDeps();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

// Only now is `node_modules` known good, so only now may a module that imports
// npm packages be resolved. Dynamic, and after the await, for that reason alone.
// Extensionless like every other import here: `allowImportingTsExtensions` is
// off, so a `./cli.ts` specifier is a TS5097 type error.
await import("./cli");
