import type { Command } from "commander";
import { checkBroadcasts } from "../broadcasts";
import { reportInterruptedPredecessor } from "../build-receipt";
import { installFatalSignalExit } from "../fatal-signals";
import { signalOriginTap } from "../signal-origin-tap";
import {
  withHostGrant,
  inheritedGrant,
} from "@plugins/infra/plugins/host-admission/server";
import {
  cpuBudget,
  type Grant,
  type Lane,
} from "@plugins/infra/plugins/host-admission/core";
import { MAIN_WORKTREE_NAME, worktreeArtifacts } from "../paths";
import { checkoutRef } from "@plugins/infra/plugins/paths/server";
import {
  MAIN_COMPOSITION_ID,
  namespaceFor,
  type Namespace,
} from "@plugins/infra/plugins/namespace/core";
import { publishLane } from "../lane";
import {
  listAllChecks,
  readCheckProgress,
  runChecks,
  scopeOf,
  type RunChecksOptions,
} from "@plugins/framework/plugins/tooling/plugins/checks/core";
import {
  CHECK_SCOPES,
  type CheckScope,
} from "@plugins/framework/plugins/tooling/core";
import {
  markWorktreeOpStart,
  setWorktreeOpPhase,
  clearWorktreeOp,
} from "@plugins/infra/plugins/worktree/server";
import {
  getWorktreeRoot,
  spawnCaptured,
} from "@plugins/infra/plugins/spawn/core";
import { createOpProfiler } from "@plugins/debug/plugins/profiling/plugins/op-log/server";

// This worktree's identity: the op-marker slug (the root's basename, matching
// what `build` / `push` write — see worktree-op.ts) and the branch the op
// record carries. `getWorktreeRoot()` is the shared, process-memoized git-root
// helper (one spawn regardless of caller count); the branch is one more
// `git rev-parse`. Mirrors the same two facts build.ts / push.ts read.
async function getWorktreeIdentity(): Promise<{
  slug: Namespace;
  branch: string;
}> {
  const root = await getWorktreeRoot();
  const branchResult = await spawnCaptured([
    "git",
    "rev-parse",
    "--abbrev-ref",
    "HEAD",
  ]);
  const branch = branchResult.stdout.trim();
  if (branchResult.exitCode !== 0 || !branch) {
    console.error(
      `Could not determine the current branch (git rev-parse said: ${branchResult.stdout.trim()})`,
    );
    process.exit(1);
  }
  // `check` runs against the main composition only — same reading as `build`,
  // where the checkout is the variable half of the pair.
  return {
    slug: namespaceFor(MAIN_COMPOSITION_ID, await checkoutRef(root)),
    branch,
  };
}

/**
 * Render the durable check-progress log: every run that never wrote its `done`
 * record, newest first, with the checks that started and never settled.
 *
 * This is the whole point of the progress log — a hung run prints NOTHING to
 * its own console (the runner's print loop only reaches stdout after
 * `Promise.all` resolves), so the only way to name the culprit is to read the
 * records from outside the wedged process.
 */
function printProgress(): void {
  const runs = readCheckProgress();
  const open = runs.filter((r) => r.done === null);
  if (open.length === 0) {
    const newest = runs[0];
    console.log(
      newest
        ? `No check run in flight. Last run finished ${newest.done?.at} (${newest.worktree}, ${newest.endedCount} checks, ${newest.done?.allOk ? "all ok" : "FAILED"}).`
        : "No check runs recorded yet.",
    );
    return;
  }
  for (const run of open) {
    console.log(
      `run ${run.runId} — ${run.worktree} (pid ${run.pid}, scope ${run.scope ?? "all"})\n` +
        `  started ${run.startedAt}, last activity ${run.lastActivityAt}`,
    );
    // A run with no `selected` record yet never got past bootstrap — it has zero
    // outstanding CHECKS, which without this branch would print as a healthy
    // "0/0 settled" and say nothing about the git spawn it is actually stuck in.
    // Report the phase instead; that is the whole reason bootstrap is
    // instrumented at all.
    if (run.selected === null) {
      const phases = [...run.outstandingBootstrap].sort(
        (a, b) => b.elapsedMs - a.elapsedMs,
      );
      console.log(
        phases.length > 0
          ? `  in bootstrap: ${phases.map((p) => `${p.checkId} (${Math.round(p.elapsedMs / 1000)}s)`).join(", ")}`
          : "  in bootstrap: between phases (no phase outstanding)",
      );
      continue;
    }
    console.log(
      `  ${run.endedCount}/${run.selected.length} settled, ${run.outstanding.length} outstanding`,
    );
    // Longest-running first: under a hang that is the suspect, by construction.
    for (const o of [...run.outstanding].sort(
      (a, b) => b.elapsedMs - a.elapsedMs,
    )) {
      console.log(
        `    • ${o.checkId} — running ${Math.round(o.elapsedMs / 1000)}s (since ${o.startedAt})`,
      );
    }
  }
}

export function registerCheck(program: Command) {
  program
    .command("check")
    .description("Run repo validation checks")
    .argument("[checks...]", "Check IDs to run (default: all)")
    .option("--list", "List available checks and exit")
    .option(
      "--status",
      "Print in-flight check runs from the durable progress log and exit. A pure read: " +
        "acquires no host grant and runs no check, so it answers from a second shell while " +
        "a run is wedged — naming the check(s) that started and never settled.",
    )
    .option("--no-cache", "Bypass the tree-hash check-result cache")
    .option(
      "--scope <scope>",
      `Run only checks of this scope (${CHECK_SCOPES.join(" | ")}); default: every scope. ` +
        "`tree` = the verdict is a function of the tree content, i.e. of what a push carries; " +
        "`deploy` = it verifies the local gitignored dist/artifact store `build` produces. " +
        "`--scope tree` reproduces the pass `./singularity push` runs.",
    )
    .option(
      "--always-run",
      "Run only the checks flagged `alwaysRun` — the cheap structural subset a " +
        "`build --skip-checks` still proves. By PROPERTY, never by id, so deleting the " +
        "last such check fails loudly instead of quietly proving less. Composes with " +
        "--scope (AND).",
    )
    .option(
      "--run-id <id>",
      "Adopt the calling op's run id, so this run's own check transcript, its progress records " +
        "and the console all name the parent op. Only valid for a nested check (one that " +
        "inherited a parent's host grant) — a top-level check must mint its own.",
    )
    .action(
      async (
        checks: string[],
        opts: {
          list?: boolean;
          status?: boolean;
          cache?: boolean;
          scope?: string;
          alwaysRun?: boolean;
          runId?: string;
        },
      ) => {
        // Validate before anything else: an unrecognized scope must NOT fall
        // through to `scope: undefined`, which means "every scope" — a typo would
        // then silently run MORE than asked and report a pass.
        let scope: CheckScope | undefined;
        if (opts.scope !== undefined) {
          if (!(CHECK_SCOPES as readonly string[]).includes(opts.scope)) {
            console.error(
              `Unknown --scope "${opts.scope}". Expected one of: ${CHECK_SCOPES.join(", ")}.`,
            );
            process.exit(1);
          }
          scope = opts.scope as CheckScope;
        }

        // NESTING, resolved before anything acts on it. The parent op (`push`, or
        // `build` via bin/check-subprocess.ts) hands this child its host CPU grant
        // in the environment; `inheritedGrant()` reconstructs it, and we spend
        // those units WITHOUT acquiring host-wide again — no double-acquire, no
        // deadlock. Its presence is also the single answer to "did a parent
        // already do this?", which several steps below now gate on. A direct
        // `./singularity check` inherits nothing and owns everything itself.
        const inherited = inheritedGrant();
        const nested = inherited !== undefined;
        // Only a top-level check plants a worktree op marker, writes an op-log
        // record, and installs its own signal handlers — the parent op already
        // owns all three, and a second set would double-count the time and churn
        // the status. "This check has a marker of its own" and "this check
        // contends for a grant of its own" are one fact, not two.
        const marker = !nested;

        // `--run-id` is meaningful ONLY for a nested check. A top-level check
        // must mint its own id, because that id also names its op-log row and its
        // kill line — reusing a parent's would collide with the parent's own
        // records. This is what lets `opId` below stay a fresh uuid on every path
        // that actually writes an op record.
        if (opts.runId !== undefined && !nested) {
          console.error(
            "--run-id is only valid for a nested check (one that inherited a parent op's " +
              "host grant via SINGULARITY_HOST_GRANT). A top-level check mints its own id, " +
              "which also names its op-log row and its kill line — adopting a parent's would " +
              "collide with the parent's own records. Drop the flag.",
          );
          process.exit(1);
        }

        if (opts.list) {
          const all = await listAllChecks();
          // Print the scope: it decides whether `push` asserts a check at all, so
          // the classification has to be auditable without reading every barrel.
          for (const c of all)
            console.log(`  [${scopeOf(c)}] ${c.id} — ${c.description}`);
          return;
        }
        if (opts.status) {
          printProgress();
          return;
        }
        // Gated on `!nested`: the parent op printed the same banner before it
        // spawned us, and a nested check re-printing it is pure noise.
        if (!nested) await checkBroadcasts("check");

        // Resolve the worktree slug once: it names the op marker and the data dir
        // this run's transcript is written into. The full check transcript is
        // always written so a failure's real cause is one `cat` away even when the
        // console copy is truncated or piped through `tail`.
        const { slug, branch } = await getWorktreeIdentity();

        // An interrupted build prints no verdict and sets no exit code its caller
        // can see, so the next op is where it surfaces. Checks are very often run
        // to validate what a build just deployed. Gated on `!nested` for the same
        // reason as the broadcast banner above: the parent op already announced
        // its predecessor, and a nested check announcing it again double-prints
        // the same line — which push does today.
        if (!nested) reportInterruptedPredecessor(slug);

        // Publish the lane: a direct check on the main worktree is human-blocking
        // (interactive), any other direct check is background. Left
        // UNCONDITIONAL, unlike the two gates above: publishLane not-clobbers, and
        // a parent op's `grant.env()` always sets SINGULARITY_LANE, so a nested
        // check already reads the parent's classification here — a `!nested` gate
        // would be a second, competing rule saying the same thing. That is how a
        // push-nested check keeps the interactive value push.ts set even though it
        // runs on an agent branch. See ../lane.ts.
        const lane: Lane =
          slug === MAIN_WORKTREE_NAME ? "interactive" : "background";
        publishLane(slug === MAIN_WORKTREE_NAME);

        // The marker (resolved at the top of the action) governs three things at
        // once, and they are one fact rather than three:
        //
        //  • the worktree op marker, which keeps the agent's pane reading as
        //    "working" and drives the op-status banner. Written up-front as
        //    "waiting-for-lock" and flipped to "running" once the host CPU grant
        //    is acquired, so a check queued for its grant reads as queued.
        //  • the op-log record. A nested check inherits its parent's grant and
        //    never queues host-wide — the parent already accounts for that time,
        //    so a second record would double-count it. Until this existed, a
        //    direct check wrote nothing at all: it occupied a grant slot, making
        //    every other agent's build and push queue, while appearing nowhere as
        //    the cause.
        //  • the signal handlers (below).
        //
        // A check has no natural id, unlike a push's pushId or a build's buildId —
        // and `opId` must be unique and non-null. A nested check ADOPTS its
        // parent's via `--run-id` (validated above to be nested-only), so the
        // child's transcript and progress records name the op a human is actually
        // looking at; a top-level check mints its own. Minted once and shared: the
        // op-log record and the signal-origin sink line are about the same run, so
        // "who killed this check?" resolves to a row the profiler also wrote.
        const opId = opts.runId ?? crypto.randomUUID();

        // …and shared once more, with this run's transcript: `check-<opId>.log`
        // sits in the worktree's data dir beside a build's artifacts, so the three
        // records of one run (op row, kill line, transcript) all answer to the
        // same id. Derived here rather than passed in, so the path this prints and
        // the path the runner writes are the same expression.
        const checkLogPath = worktreeArtifacts.checkLog(slug, opId);

        const profiler = marker
          ? createOpProfiler("check", {
              opId,
              branch,
              opSlug: slug,
              lane,
            })
          : undefined;

        if (marker) {
          profiler?.markRequested();
          markWorktreeOpStart(slug, "check", "waiting-for-lock");
          process.on("exit", () => {
            clearWorktreeOp(slug, "check");
            // The terminal record, on every graceful exit — including the
            // `process.exit(1)` below, which skips the `finally`. Idempotent, and
            // an outcome already stamped by `complete()` wins; a path that
            // exits without one (an uncaught throw) lands as "error", which is
            // the truth about it.
            profiler?.write();
          });

          // Catchable fatal signals → graceful exit so the exit handler above
          // (clearWorktreeOp) runs — e.g. the wrapper's orphan SIGTERM tears this
          // worker down cleanly. Like the `process.exit(1)` path, this skips the
          // `finally`, whose only cleanup is the same clearWorktreeOp. SIGKILL is
          // uncatchable; the marker's pid-liveness check is the self-heal there.
          // The signal→exit-code map is shared with `build` and `push`; see
          // ../fatal-signals.ts.
          //
          // The tap arms here too, and the sink is this command's ONLY record of a
          // death: a check owns no deploy receipt, so without the line an
          // externally-killed check leaves nothing behind but a cleared marker.
          // Gated on `marker` with everything else, deliberately — a push-nested
          // check installs no handlers at all, so the parent push (which owns the
          // marker, the grant and the op record) is the one that records the kill.
          installFatalSignalExit(signalOriginTap({ opId, worktree: slug }));
        }
        try {
          const runUnder = (grant: Grant): Promise<boolean> => {
            // The grant is now held — on the direct path `runUnder` is the
            // `withHostGrant` callback, so this runs only after acquisition; flip
            // the marker to "running" (a no-op on the inherited path, where
            // `marker` is false and the parent push owns the status).
            if (marker) setWorktreeOpPhase(slug, "check", "running");
            // The host grant IS a check's entry ticket — unlike push and build, it
            // does no further waiting after this point.
            profiler?.markGranted();
            const runOpts: RunChecksOptions = {
              grant,
              // One step per individual check, so a `check` bar drills in to
              // `type-check` / `eslint` / … — the affordance `build` already has
              // via the same hook (build.ts:1158 → `pushBuildSpan`). Gated on the
              // profiler, i.e. on `marker`: a push-nested check must write no
              // record of its own, and therefore no steps either.
              //
              // `onCheckDone` reports a check that has ALREADY finished, so this
              // must be `recordStep` (duration + start supplied) and never
              // `stepStart`/`stepEnd` (which read the clock themselves and would
              // stamp the check's end as its start).
              //
              // CLOCK. `wallStartMs` is a `performance.now()` reading (runner.ts:147)
              // despite the name — monotonic, NOT a `Date.now()` epoch. It is passed
              // through untouched because `recordStep` takes that clock by contract:
              // it pairs `performance.now()` with `grantedAt` at the grant instant,
              // so the step's offset is an exact monotonic subtraction. Converting
              // here (`performance.timeOrigin + wallStartMs`) would look equivalent
              // and would instead bake in `timeOrigin`'s process-start capture error
              // — ~6ms under the load where this profiler earns its keep.
              onCheckDone: profiler
                ? (id, durationMs, wallStartMs) =>
                    profiler.recordStep(id, durationMs, wallStartMs)
                : undefined,
              noCache: opts.cache === false,
              scope,
              alwaysRun: opts.alwaysRun === true,
              logRun: { worktree: slug, runId: opId },
              log: (line, stream) =>
                stream === "stderr" ? console.error(line) : console.log(line),
            };
            return runChecks(checks.length > 0 ? checks : undefined, runOpts);
          };
          const ok = inherited
            ? await runUnder(inherited)
            : // `grantHooks()` is what makes this queue visible: this is the wait
              // that made a direct check an invisible contender. On the inherited
              // path there is no profiler and no acquire, so there is nothing to
              // record.
              await withHostGrant(
                { lane, max: cpuBudget().B, hooks: profiler?.grantHooks() },
                runUnder,
              );
          profiler?.complete(ok ? "success" : "failed");
          if (!ok) {
            // Last line, so it survives `./singularity check | tail`.
            console.error(`\nFull check output: ${checkLogPath}`);
            process.exit(1);
          }
        } finally {
          if (marker) clearWorktreeOp(slug, "check");
        }
      },
    );
}
