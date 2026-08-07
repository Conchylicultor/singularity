import type { Command } from "commander";
import { basename } from "path";
import { checkBroadcasts } from "../broadcasts";
import { reportInterruptedPredecessor } from "../build-receipt";
import { ensureDeps } from "../ensure-deps";
import { installFatalSignalExit } from "../fatal-signals";
import { signalOriginTap } from "../signal-origin-tap";
import { normalizeGeneratedArtifacts, SKIP_POST_REWRITE_ENV } from "../git/normalize-generated";
import { createOpProfiler, type OpProfiler } from "@plugins/debug/plugins/profiling/plugins/op-log/server";
import { pushPool, withHostGrant } from "@plugins/infra/plugins/host-admission/server";
import { cpuBudget, type Grant } from "@plugins/infra/plugins/host-admission/core";
import { markWorktreeOpStart, setWorktreeOpPhase, clearWorktreeOp, writePushHolder, clearPushHolder } from "@plugins/infra/plugins/worktree/server";
import { spawnCaptured, spawnPassthrough } from "@plugins/infra/plugins/spawn/core";

// Exits-by-default spawn: a non-zero exit prints the command + captured
// stderr and exits(1) like `exec`, so a caller can never read a failed git
// call's empty stdout as real data (e.g. a failed `git status` absorbed as a
// "clean tree" and pushed over uncommitted changes). Returns trimmed stdout.
// For the sites that genuinely branch on the exit code, use `runAllowFail`.
async function run(cmd: string[], cwd?: string): Promise<string> {
  const result = await spawnCaptured(cmd, { cwd });
  if (result.exitCode !== 0) {
    console.error(`Command failed (exit ${result.exitCode}): ${cmd.join(" ")}`);
    if (result.stderr.trim()) console.error(result.stderr.trim());
    process.exit(1);
  }
  return result.stdout.trim();
}

// Old behavior — returns both stdout and exitCode without throwing. Only for
// the sites that branch on the exit code themselves (a git command whose
// non-zero exit is an expected, handled outcome, e.g. a conflicting rebase).
// stderr now prints once after exit (it used to stream via "inherit").
async function runAllowFail(
  cmd: string[],
  cwd?: string,
  env?: Record<string, string | undefined>,
): Promise<{ stdout: string; exitCode: number }> {
  const result = await spawnCaptured(cmd, { cwd, env });
  if (result.stderr) process.stderr.write(result.stderr);
  return { stdout: result.stdout.trim(), exitCode: result.exitCode };
}

async function exec(cmd: string[], cwd?: string, env?: Record<string, string | undefined>): Promise<void> {
  const { exitCode } = await spawnPassthrough(cmd, { cwd, env });
  if (exitCode !== 0) {
    process.exit(1);
  }
}

// Env for THIS push's own rebases. The `post-rewrite` hook normalizes generated
// artifacts after any other rebase; push suppresses it because it owns the
// ordering itself — it installs the rebased lockfile FIRST, then normalizes, so
// the regen runs against node_modules that match the tree it is regenerating.
const rebaseEnv = (): Record<string, string | undefined> => ({
  ...process.env,
  [SKIP_POST_REWRITE_ENV]: "1",
});

// Install the lockfile the rebase just brought in — main may have added
// dependencies this worktree has never installed.
//
// Routed through `ensureDeps` rather than a bare `bun install --frozen-lockfile`,
// which is what this used to be. That call had three defects, all of which
// `ensureDeps` already answers and none of which are push-specific:
//
//   • UNSERIALIZED — it took no `.install.lock`, so it could run concurrently
//     with any other CLI-mediated install in this checkout, which is exactly the
//     `clonefileat` race bun 1.3.13 has no mutex for.
//   • UNSTAMPED — it left `node_modules/.singularity-deps` describing the
//     PRE-rebase inputs, so the very next CLI process saw stale inputs and
//     reinstalled everything. In this flow that next process is the checks
//     subprocess, four lines below: every push whose rebase touched the lockfile
//     paid for two full installs back-to-back, the second one while holding the
//     host-wide push mutex.
//   • UNATTRIBUTED — a failure exited 1 through the generic `exec` path with no
//     statement of which phase died.
//
// `--frozen-lockfile` is preserved via the option: the tree is mid-push, and a
// re-resolved `bun.lock` would dirty the very commit about to fast-forward onto
// main. The freshness gate is sound here for the same reason it is everywhere —
// `bun.lock` and every `package.json` are signature inputs, so a rebase that
// moved any of them installs, and one that moved none has nothing to install.
async function installRebasedDeps(root: string): Promise<void> {
  try {
    await ensureDeps({ root, frozenLockfile: true });
  } catch (err) {
    // The message is written to be the whole story (which phase, likely cause,
    // what to do); a stack would name this bootstrap rather than the problem.
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

// Spawns a fresh process so checks see the post-rebase code on disk, not the
// stale module cache from process start. The eslint check always considers the
// full lintable set; its per-file closure cache decides what actually re-lints,
// so there is no lint scope env to thread through. The child INHERITS this
// push's host CPU grant via `grant.env()` (SINGULARITY_HOST_GRANT +
// SINGULARITY_LANE): its own `inheritedGrant()` reconstructs the grant and
// SPENDS those units for its type-check fleet without re-acquiring host-wide —
// no double-acquire, no deadlock (the parent already holds the slots).
//
// `--scope tree` narrows the pass to the push payload (see `Check.scope`).
// Deploy-scoped checks verify the local gitignored dist / artifact store that
// `build` produces: it never lands on main, and this push's own rebase moves the
// tree past it by construction, so a push can never meaningfully assert it — it
// could only ever report the artifact as stale for having done its job. The
// filter is EXPRESSED here as a flag and RESOLVED in the child, for the same
// reason the child exists at all: computing an id list in this process would
// read the pre-rebase module cache. It is by property, never by id, and
// hand-reproducible as `./singularity check --scope tree`.
async function runChecksSubprocess(root: string, grant: Grant): Promise<boolean> {
  const { exitCode } = await spawnPassthrough(
    ["bun", "plugins/framework/plugins/cli/bin/index.ts", "check", "--scope", "tree"],
    {
      cwd: root,
      // `process.env` values are `string | undefined`; the inferred spread type
      // is exactly what the spawn `env` contract accepts.
      env: { ...process.env, ...grant.env() },
    },
  );
  return exitCode === 0;
}

// Run the rebased-tree checks. A push is human-blocking, so it takes an
// INTERACTIVE host CPU grant (its reserved floor is unreachable by agent work,
// so it never queues behind agent builds) — even though the checks execute on
// the rebased AGENT branch, where a branch-based gate would wrongly demote them.
// The grant is acquired here (inside the already-held push mutex — acyclic: the
// mutex holder waits for CPU units, a unit holder never waits for the push
// mutex) and handed to the child via `grant.env()`.
//
// This acquire is POST-`markGranted` — the push already holds its entry ticket
// (the mutex) and is doing its own work — which is exactly why its wait was
// invisible: with no hooks, the grant queue was folded into the `checks` step's
// wall clock, so a slow `checks` was indistinguishably queue time or real check
// time. `grantHooks()` lands it as its own `host-grant` wait, nested inside the
// step.
async function runRebasedChecks(root: string, profiler: OpProfiler<"push">): Promise<boolean> {
  profiler.stepStart("checks");
  console.log("Running checks...");
  const ok = await withHostGrant(
    { lane: "interactive", max: cpuBudget().B, hooks: profiler.grantHooks() },
    (grant) => runChecksSubprocess(root, grant),
  );
  profiler.stepEnd("checks");
  return ok;
}

async function getWorktreeRoot(): Promise<string> {
  const stdout = await run(["git", "rev-parse", "--show-toplevel"]);
  if (!stdout) {
    console.error("Not in a git repository");
    process.exit(1);
  }
  return stdout;
}


async function getMainWorktree(): Promise<string> {
  const stdout = await run(["git", "worktree", "list", "--porcelain"]);
  // First worktree listed is always the main one
  const match = stdout.match(/^worktree (.+)$/m);
  if (!match) {
    console.error("Could not determine main worktree");
    process.exit(1);
  }
  return match[1]!;
}

async function getCurrentBranch(): Promise<string> {
  const { stdout, exitCode } = await runAllowFail([
    "git",
    "rev-parse",
    "--abbrev-ref",
    "HEAD",
  ]);
  if (exitCode !== 0 || !stdout) {
    console.error("Could not determine current branch");
    process.exit(1);
  }
  return stdout;
}

// The push mutex is the `push` host-pool (host-admission): `pushPool.run(fn)`
// holds its single slot file — `~/.singularity/push-slots/slot-0.lock`, the same
// file the server-side `pushLockHeld` probe reads — for the whole critical
// section, so at most one push runs host-wide. This folds the last hand-rolled
// FFI flock onto the shared primitive: the size-1 fan-out is a single
// `flock-wait` child (off the event loop), and the "waiting for lock" line moves
// to the pool's `onWaitStart` hook. `onLockRequested` fires before the acquire
// (so a blocked push shows as waiting); `onLockAcquired` fires once the slot is
// held, as the first thing inside the run body.
async function withPushLock<T>(
  fn: () => Promise<T>,
  onLockRequested: () => void,
  onLockAcquired: () => void,
): Promise<T> {
  onLockRequested();
  return pushPool.run(
    async () => {
      onLockAcquired();
      return await fn();
    },
    { onWaitStart: () => console.log("Another push is in progress — waiting for lock...") },
  );
}

export function registerPush(program: Command) {
  program
    .command("push")
    .description("Commit (if -m provided), merge into main, and push")
    .option("-m, --message <msg>", "Commit message — stages and commits all changes before pushing")
    .option(
      "--from-main",
      "DANGER: commit and push directly from main, bypassing the worktree-merge flow. " +
        "Agents MUST NOT pass this flag without explicit user approval in the current conversation. " +
        "Intended only when a human is driving and the worktree detour would be pure churn " +
        "(e.g. small fixes already staged on main). Still runs checks.",
    )
    .action(async (opts: {
      message?: string;
      fromMain?: boolean;
    }) => {
      const branch = await getCurrentBranch();
      const onMain = branch === "main";

      await checkBroadcasts("push");

      const root0 = await getWorktreeRoot();

      // One push id per invocation; every commit that lands on main as part of
      // this push gets stamped with it (via `git commit --trailer` for the
      // --from-main path, and via `git rebase --exec` for the worktree path).
      // Watchers on every namespace read the trailer to group commits into a
      // single push event.
      const pushId = crypto.randomUUID();

      if (onMain && !opts.fromMain) {
        console.error("Already on main — nothing to merge.");
        process.exit(1);
      }
      if (opts.fromMain && !onMain) {
        console.error(`--from-main requires being on main (currently on ${branch}).`);
        process.exit(1);
      }

      // basename(root0) is the op-marker slug (see markWorktreeOpStart below).
      // The profiler carries it so the orphan reconciler can check push liveness.
      const opSlug = basename(root0);

      // An interrupted build prints no verdict and sets no exit code its caller
      // can see, so the next op is where it surfaces — and pushing work that was
      // never actually deployed is the expensive version of that mistake.
      reportInterruptedPredecessor(opSlug);
      // A push is human-blocking, so every grant it takes is interactive — the
      // same fact `runRebasedChecks` passes to `withHostGrant`. Recorded on the
      // op because the lane is what explains WHY a wait was as long as it was.
      const profiler = createOpProfiler("push", {
        opId: pushId,
        branch,
        opSlug,
        lane: "interactive",
        mode: opts.fromMain ? "from-main" : "worktree",
      });

      // Mark this worktree as having a push in flight so the conversation status
      // poller keeps the agent's pane reading as "working" for the push duration
      // despite the CLI "shell" status. Written up-front — BEFORE the lock wait —
      // so a push that queues behind another push reads as "working" while it
      // waits its turn, not "waiting": a queued push is genuinely in progress.
      // (The marker pid is this process, which stays alive throughout the wait.)
      // Cleared on every graceful exit — normal completion, every process.exit(1)
      // failure path, and thrown errors — via the on-exit handler; a SIGKILLed
      // push self-heals via the marker's pid-liveness check.
      markWorktreeOpStart(opSlug, "push", "waiting-for-lock");
      process.on("exit", () => {
        clearWorktreeOp(opSlug, "push");
        // Only removes the holder file if it still names THIS push (guards
        // against a late-firing exit handler deleting the next holder's file).
        clearPushHolder(pushId);
      });

      // Catchable fatal signals → graceful exit so the exit handler above
      // (clearWorktreeOp + clearPushHolder) runs — e.g. the wrapper's orphan
      // SIGTERM tears this worker down cleanly. SIGKILL is uncatchable; the
      // holder's pid-liveness check is the self-heal there. The signal→exit-code
      // map is shared with `build` and `check`; see ../fatal-signals.ts.
      //
      // The tap arms here too, and the sink is this command's ONLY record of a
      // death — a push owns no deploy receipt. It is also the op where an
      // unattributed death costs the most: a push holds the host-wide push
      // mutex, so every agent on the box queues behind whoever killed it.
      installFatalSignalExit(signalOriginTap({ opId: pushId, worktree: opSlug }));
      // Fires immediately BEFORE `pushPool.run` (see withPushLock), so a push
      // blocked on the mutex lands on disk as a live "waiting" row before it
      // ever holds the lock. A failure BEFORE this point writes no record at
      // all — it never contended for anything.
      const onLockRequested = (): void => {
        profiler.markRequested();
        profiler.waitStart("push-mutex");
      };
      const onLockAcquired = (): void => {
        // Lock granted — publish this push as the single global lock holder. The
        // op-status resource DERIVES "running" from this holder file + the kernel
        // flock, so this is the authoritative signal (immune to a stale marker
        // left by a hard-killed peer). The marker phase flip below is now just an
        // advisory hint AND the filesystem event that wakes the op watcher.
        writePushHolder({
          slug: opSlug,
          pid: process.pid,
          pushId,
          acquiredAt: new Date().toISOString(),
        });
        setWorktreeOpPhase(opSlug, "push", "running");
        // The mutex — this push's ENTRY ticket — is held and its own work
        // starts. It is not done waiting: `runRebasedChecks` still queues for a
        // host grant, which lands as a further `host-grant` wait.
        profiler.waitEnd();
        profiler.markGranted();
      };

      // 1. Commit if -m provided, otherwise require clean tree
      const status = await run(["git", "status", "--porcelain"]);
      if (opts.message) {
        if (status) {
          const files = status.split("\n").map((l) => l.trim());
          console.log(`Committing ${files.length} file(s)${opts.fromMain ? " on main" : ""}:`);
          for (const f of files) console.log(`  ${f}`);
          await exec(["git", "add", "-A"]);
          await exec(["git", "commit", "-m", opts.message]);
        } else {
          console.log("No files to commit.");
        }
      } else if (status) {
        console.error(
          'Missing `-m "commit message"` flag. You have uncommitted changes.',
        );
        process.exit(1);
      }

      // 1b. Consume any merge marker this push did NOT produce — a manual
      //     `git rebase origin/main` whose post-rewrite hook did not run, or an
      //     earlier push that died between its rebase and its normalize. This
      //     used to be a blind `rm -rf` of the marker dir, which DESTROYED that
      //     signal: the tree still carried main's version of a generated file,
      //     nothing re-derived it, and the checks below failed on a *.generated.ts
      //     the agent never touched. Consuming (not discarding) is the fix; the
      //     regen is idempotent, so a genuinely stale marker costs one no-op pass.
      //     Runs AFTER the commit step above so the amend can never swallow
      //     uncommitted work.
      profiler.stepStart("normalize-inherited");
      await normalizeGeneratedArtifacts(root0, { pushId });
      profiler.stepEnd("normalize-inherited");

      // --from-main: rebase onto origin/main and push. No worktree merge.
      // Split fetch + rebase because `git pull --rebase --exec` isn't a valid
      // flag combination on Apple Git (the --exec doesn't propagate to rebase).
      if (opts.fromMain) {
        try {
          await withPushLock(async () => {
            profiler.stepStart("fetch");
            console.log("Pulling main...");
            await exec(["git", "fetch", "origin", "main"]);
            profiler.stepEnd("fetch");

            profiler.stepStart("rebase");
            await exec(
              [
                "git",
                "rebase",
                "origin/main",
                "--exec",
                `git -c trailer.ifexists=replace commit --amend --no-edit --trailer Singularity-Push=${pushId}`,
              ],
              undefined,
              rebaseEnv(),
            );
            profiler.stepEnd("rebase");

            const fromMainRoot = await getWorktreeRoot();

            profiler.stepStart("bun-install");
            await installRebasedDeps(fromMainRoot);
            profiler.stepEnd("bun-install");

            profiler.stepStart("normalize");
            await normalizeGeneratedArtifacts(fromMainRoot, { pushId });
            profiler.stepEnd("normalize");

            const ok = await runRebasedChecks(fromMainRoot, profiler);
            if (!ok) {
              console.error(
                "Checks failed after rebase. Fix the issue and re-run ./singularity push " +
                  "(your commit is still on HEAD; use `git reset --soft HEAD~1` to unstage it if needed).\n\n" +
                  "If the failure is unrelated to your commits (e.g. a pre-existing issue on main), " +
                  "try rebasing onto the latest main (`git fetch origin main && git rebase origin/main`) and re-running — the issue may already be fixed upstream.\n\n" +
                  "If you cannot fix the failing check(s): STOP, report the failure to the user, and wait for instructions. " +
                  "Do NOT work around check failures — not by disabling checks, editing check code, " +
                  "expanding skip lists, committing via raw git, or any other means.",
              );
              profiler.complete("failed_checks");
              profiler.write();
              process.exit(1);
            }

            profiler.stepStart("push-main");
            console.log("Pushing main...");
            await exec(["git", "push"]);
            profiler.stepEnd("push-main");
          }, onLockRequested, onLockAcquired);
        } catch (err) {
          profiler.complete("error");
          profiler.write();
          throw err;
        }
        profiler.complete("success");
        profiler.write();
        console.log("Done. Pushed directly from main.");
        return;
      }

      // Steps 2–7 touch the shared main worktree and must be serialized
      // across all concurrent agents. The flock is held for the entire
      // critical section so no two pushes can race on main.
      const mainWorktree = await getMainWorktree();
      try {
        await withPushLock(async () => {
          // 2. Pull main to ensure it's up to date before merging.
          // Use explicit fetch + merge instead of `git pull --ff-only` because FETCH_HEAD
          // is shared across all worktrees; a prior fetch in another worktree can leave
          // multiple "for-merge" entries, causing "Cannot fast-forward to multiple branches".
          profiler.stepStart("fetch");
          console.log("Pulling main...");
          await exec(["git", "fetch", "origin", "main"], mainWorktree);
          profiler.stepEnd("fetch");

          profiler.stepStart("ff-main");
          await exec(["git", "merge", "--ff-only", "origin/main"], mainWorktree);
          profiler.stepEnd("ff-main");

          // 3. Rebase onto main so the merge is always a fast-forward. `--exec`
          //    runs after each replayed commit, amending it to carry a shared
          //    Singularity-Push trailer so the server can group all commits in
          //    this push as a single event.
          profiler.stepStart("rebase");
          const { exitCode: rebaseExit } = await runAllowFail(
            [
              "git",
              "rebase",
              "main",
              "--exec",
              `git -c trailer.ifexists=replace commit --amend --no-edit --trailer Singularity-Push=${pushId}`,
            ],
            undefined,
            rebaseEnv(),
          );
          profiler.stepEnd("rebase");
          if (rebaseExit !== 0) {
            // Best-effort cleanup on the failure path; do not let an abort
            // failure mask the actionable rebase-conflict message printed below.
            await runAllowFail(["git", "rebase", "--abort"]);
            console.error(
              [
                `Rebase of ${branch} onto main failed (aborted).`,
                ``,
                `Conflicts during this rebase are routine when main has moved — resolve them yourself, don't bail out.`,
                ``,
                `To resolve:`,
                `  1. git fetch origin main`,
                `  2. git rebase origin/main     (NEVER 'git merge' — push re-rebases and a merge commit produces churn)`,
                `  3. Resolve conflicts, then 'git add <files>' and 'git rebase --continue'`,
                `     (or 'git rebase --abort' to bail out)`,
                `  4. Re-run ./singularity push`,
                ``,
                `If main's shape has diverged so much your commit no longer applies, re-apply your`,
                `changes by hand onto a fresh worktree branched from origin/main. Never 'git reset'`,
                `your branch onto main — it stages a deletion of every commit that landed in between.`,
              ].join("\n"),
            );
            profiler.complete("failed_rebase");
            profiler.write();
            process.exit(1);
          }

          // 3b. Ensure node_modules matches the rebased lockfile — main may
          //     have added dependencies the worktree hasn't installed yet.
          profiler.stepStart("bun-install");
          await installRebasedDeps(await getWorktreeRoot());
          profiler.stepEnd("bun-install");

          // 3c. Post-rebase normalize: regenerate auto-generated artifacts
          //     (docs, drizzle migrations) from the rebased source tree and
          //     amend the head commit. The merge drivers in .gitattributes
          //     accepted the upstream side during the rebase; this step makes
          //     the final commit canonical. Aborts on hand-edited migrations
          //     or on real conflict markers in CLAUDE.md prose.
          profiler.stepStart("normalize");
          await normalizeGeneratedArtifacts(await getWorktreeRoot(), { pushId });
          profiler.stepEnd("normalize");

          // 4. Run checks on the rebased tree — this is exactly what will land on
          //    main, and the pass is scoped to exactly that (`--scope tree`).
          //    Deploy-scoped checks verify the local gitignored dist/artifact
          //    store, which never lands on main and which the rebase above
          //    invalidates by construction; `build` and main's post-push
          //    auto-build assert those for real.
          //    Spawned as a subprocess so the check code comes from the rebased
          //    tree, not the (potentially stale) module cache of this process.
          const root = await getWorktreeRoot();
          const ok = await runRebasedChecks(root, profiler);
          if (!ok) {
            console.error(
              `Checks failed after rebasing ${branch} onto main. ` +
                `Fix the issue and re-run ./singularity push ` +
                `(your commits are on ${branch}; use \`git reset --soft HEAD~1\` to unstage the last one if needed).\n\n` +
                `If the failure is unrelated to your commits (e.g. a pre-existing issue on main), ` +
                `try rebasing onto the latest main (\`git fetch origin main && git rebase origin/main\`) and re-running — the issue may already be fixed upstream.\n\n` +
                `If you cannot fix the failing check(s): STOP, report the failure to the user, and wait for instructions. ` +
                `Do NOT work around check failures — not by disabling checks, editing check code, ` +
                `expanding skip lists, committing via raw git, or any other means.`,
            );
            profiler.complete("failed_checks");
            profiler.write();
            process.exit(1);
          }

          // 5. Push the branch (force since rebase rewrites history — safe for single-owner worktree branches)
          profiler.stepStart("push-branch");
          console.log(`Pushing branch ${branch}...`);
          await exec(["git", "push", "--force-with-lease", "-u", "origin", branch]);
          profiler.stepEnd("push-branch");

          // 6. Fast-forward merge into main (guaranteed to succeed — we hold the
          //    lock, so no other push can have advanced main since our rebase).
          profiler.stepStart("ff-merge");
          console.log(`Merging ${branch} into main...`);
          await exec(["git", "merge", "--ff-only", branch], mainWorktree);
          profiler.stepEnd("ff-merge");

          // 7. Push main
          profiler.stepStart("push-main");
          console.log("Pushing main...");
          await exec(["git", "push"], mainWorktree);
          profiler.stepEnd("push-main");
        }, onLockRequested, onLockAcquired);
      } catch (err) {
        profiler.complete("error");
        profiler.write();
        throw err;
      }

      profiler.complete("success");
      profiler.write();
      console.log(`Done. ${branch} merged into main and pushed.`);
    });
}
