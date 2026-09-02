import { WORKTREES_DIR_DISPLAY } from "@plugins/infra/plugins/paths/plugins/display/core";
import { recordMemoryCheckpoint } from "../core/profiler";
import { bootPluginGraph, runShutdownHooks } from "../shared/boot-stages";

// ── `exec` — the short-lived boot mode ───────────────────────────────────────
//
// A process that runs ONE registered piece of work and exits: it needs the
// plugin graph loaded, `register` run, contributions collected (that is how a
// consumer finds its contributed sources and targets) and `onReadyBlocking`
// completed (DB pool, migrations, config registry). It needs nothing else.
//
// It shares `../shared/boot-stages.ts` with `serve` (`../bin/index.ts`) rather
// than re-implementing the sequence, because a second copy of a boot path that
// only runs when something is already unusual is the copy that rots — the lesson
// of release's recovery path
// (research/2026-09-01-global-supervised-run-survives-restart.md).
//
// WHY THIS LIVES IN `cli/`: an exec process IS a `./singularity` command process
// — the future `supervised-exec` verb — and `cli/` is a runtime barrel, so
// `@plugins/framework/plugins/server-core/cli` is a legal cross-plugin import
// while `bin/` is not (R4 admits only runtime barrels, which is why nothing may
// import into a `bin/` path). This barrel declares no command of its own, the
// same shape the four shared-CLI-machinery barrels under `framework/cli/plugins`
// already have, so it is not in `cli.generated.ts` and is not loaded on every
// `./singularity` invocation.
//
// WHAT `exec` SKIPS, AND WHY EACH WOULD BE WRONG HERE:
//
// - **Socket bind.** There is nothing to serve, and `SOCKET_PATH` is not set in
//   a child. Binding would also collide with the live backend's own socket.
// - **`markServerReady()`.** This process is not a serving backend. The flag is
//   read by exactly one caller, `GET /api/health/ready` (infra/health), and exec
//   mounts no routes — but setting it would still be a claim that is false.
// - **`onReady`.** This is where the background machinery starts: the
//   graphile-worker runners, the git ref watcher, the change-feed LISTEN
//   consumer, the conversations poller, the supervised-run reconciler. A child
//   that started them would compete with the live backend for queue jobs and
//   would re-attach to (or write off) runs it does not own.
// - **`onAllReady`.** Cron installation lives here (`jobs`' `installScheduledCronItems`).
//   A child installing crontab items is a duplicate scheduler.
// - **`drainWarmups`.** Heavy, deliberately-post-serving warm-up work whose whole
//   justification is that a long-lived backend will answer requests from it.
// - **The QoS boost.** `serve` raises MAIN's event-loop thread to
//   user-interactive; a background child must stay at background priority or it
//   defeats the priority isolation it was spawned under.
// - **Signal handlers.** A supervised child is cancelled by signalling its
//   process group, and the default disposition — terminate now — is what a
//   cancel wants. A graceful handler would delay it.
// - **The orphan-exit poll.** `serve` exits when reparented to init, because a
//   surviving backend after a gateway crash leaks. A detached supervised child is
//   *supposed* to be reparented to init; that poll would kill it immediately.
//
// `isMain()` is env-derived (`SINGULARITY_WORKTREE === "singularity"`), so a
// child spawned by main's backend inherits a TRUE `isMain()`. Nothing gated on
// it fires here: every main-only side effect in the tree hangs off `onReady`,
// `onAllReady` or a warm-up, all of which exec skips.
//
// The child inherits `SINGULARITY_WORKTREE` from its parent, which is what
// `database`'s `requireWorktree()` reads to resolve the per-worktree DB — so an
// exec child talks to exactly the database its parent backend does, with no
// extra plumbing.

/**
 * Boot this process in `exec` mode, run `body`, tear the runtime down and exit.
 *
 * ```ts
 * // in a CLI command that IS the short-lived child
 * await runExec(async () => {
 *   await runBackupTask(payload);
 * });
 * ```
 *
 * The whole boot is inside this call, so there is no way to obtain a
 * half-booted runtime: `body` runs only after the graph is loaded, registered,
 * its contributions collected and the `onReadyBlocking` barrier complete. There
 * is no runtime handle to pass around either — booting populates module-global
 * registries (the DB pool, the job registry, the contribution tables), and every
 * consumer already reads them through its own plugin's barrel.
 *
 * Returns `never`: the process exits 0 when `body` resolves and 1 when it (or
 * boot) throws. A short-lived child that returned to its caller could linger on
 * an open pool or listener, and a supervised run whose child never exits stays
 * in flight forever — so exiting is part of the contract, not the caller's
 * responsibility.
 */
export async function runExec(
  body: () => void | Promise<void>,
): Promise<never> {
  assertWorktreeIdentity();
  recordMemoryCheckpoint("boot-start");
  let ordered;
  try {
    // Dynamic on purpose. A command DECLARATION (`cli/index.ts`) is measured by
    // `cli:command-declarations-light`, which stops at dynamic-import edges — so
    // the future `supervised-exec` declaration that imports this barrel keeps a
    // trivial static closure, and neither the registry nor `spec.json` is read
    // by a `./singularity` invocation that is not this one.
    const { serverEntries, hasCoreBarrel } =
      await import("../bin/active-runtime");
    ordered = await bootPluginGraph({
      mode: "exec",
      entries: serverEntries,
      hasCoreBarrel,
    });
    await body();
  } catch (err) {
    console.error("[exec] failed", err);
    if (ordered) await runShutdownHooks(ordered);
    process.exit(1);
  }
  await runShutdownHooks(ordered);
  process.exit(0);
}

/**
 * `exec` inherits its worktree identity; it never derives one.
 *
 * `SINGULARITY_WORKTREE` names both the plugin registry this process boots
 * (`bin/active-runtime`) and the Postgres database it talks to
 * (`database`'s `requireWorktree()`). A supervised child gets it from the
 * backend that spawned it. A human typing the command in a shell does not — and
 * that is exactly how this was first found.
 *
 * Asserted HERE, before a single plugin is imported, because the failure
 * otherwise arrives 83 plugins deep and describes the wrong thing entirely:
 * `config_v2/server` throws at module eval without it, and every plugin that
 * imports `ConfigV2` from that half-evaluated barrel then fails with
 * `ReferenceError: Cannot access 'ConfigV2' before initialization` — 82 lines of
 * TDZ burying the one line that said what was actually missing.
 *
 * Guessing the namespace from the checkout path is deliberately NOT done: it
 * would pick a database, and picking the wrong one silently is worse than
 * refusing. The caller states the identity or gets told to.
 */
function assertWorktreeIdentity(): void {
  if (process.env.SINGULARITY_WORKTREE) return;
  throw new Error(
    "[exec] SINGULARITY_WORKTREE is not set. It names the plugin registry to boot " +
      "and the database to talk to, so an exec runtime cannot start without it. " +
      "A supervised child inherits it from the backend that spawned it; running " +
      "this command by hand does not, so set it explicitly — e.g. " +
      "`SINGULARITY_WORKTREE=<namespace> ./singularity <command>`, where " +
      `<namespace> is the directory name under ${WORKTREES_DIR_DISPLAY}/.`,
  );
}
