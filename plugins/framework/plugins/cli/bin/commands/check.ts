import { basename, join } from "path";
import type { Command } from "commander";
import { checkBroadcasts } from "../broadcasts";
import { withHostGrant, inheritedGrant } from "@plugins/infra/plugins/host-admission/server";
import { cpuBudget, type Grant, type Lane } from "@plugins/infra/plugins/host-admission/core";
import { MAIN_WORKTREE_NAME, worktreeDataDir } from "../paths";
import { publishLane } from "../lane";
import { listAllChecks, readCheckProgress, runChecks, scopeOf, type RunChecksOptions } from "@plugins/framework/plugins/tooling/plugins/checks/core";
import { CHECK_SCOPES, type CheckScope } from "@plugins/framework/plugins/tooling/core";
import { markWorktreeOpStart, setWorktreeOpPhase, clearWorktreeOp } from "@plugins/infra/plugins/worktree/server";
import { createOpProfiler } from "@plugins/debug/plugins/profiling/plugins/op-log/server";

// This worktree's identity, from ONE `git rev-parse`: the op-marker slug (the
// root's basename, matching what `build` / `push` write — see worktree-op.ts)
// and the branch the op record carries. `rev-parse` takes both requests in one
// invocation and answers in order, so there is no reason to pay for a second
// process launch. Mirrors the local `getWorktreeRoot()` helpers in build.ts /
// push.ts.
async function getWorktreeIdentity(): Promise<{ slug: string; branch: string }> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel", "--abbrev-ref", "HEAD"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = await new Response(proc.stdout).text();
  if ((await proc.exited) !== 0) {
    console.error("Not in a git repository");
    process.exit(1);
  }
  const [root, branch] = output.trim().split("\n");
  if (!root || !branch) {
    console.error(`Could not determine the worktree root and branch (git rev-parse said: ${output.trim()})`);
    process.exit(1);
  }
  return { slug: basename(root), branch };
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
      const phases = [...run.outstandingBootstrap].sort((a, b) => b.elapsedMs - a.elapsedMs);
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
    for (const o of [...run.outstanding].sort((a, b) => b.elapsedMs - a.elapsedMs)) {
      console.log(`    • ${o.checkId} — running ${Math.round(o.elapsedMs / 1000)}s (since ${o.startedAt})`);
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
    .action(async (checks: string[], opts: { list?: boolean; status?: boolean; cache?: boolean; scope?: string }) => {
      // Validate before anything else: an unrecognized scope must NOT fall
      // through to `scope: undefined`, which means "every scope" — a typo would
      // then silently run MORE than asked and report a pass.
      let scope: CheckScope | undefined;
      if (opts.scope !== undefined) {
        if (!(CHECK_SCOPES as readonly string[]).includes(opts.scope)) {
          console.error(`Unknown --scope "${opts.scope}". Expected one of: ${CHECK_SCOPES.join(", ")}.`);
          process.exit(1);
        }
        scope = opts.scope as CheckScope;
      }

      if (opts.list) {
        const all = await listAllChecks();
        // Print the scope: it decides whether `push` asserts a check at all, so
        // the classification has to be auditable without reading every barrel.
        for (const c of all) console.log(`  [${scopeOf(c)}] ${c.id} — ${c.description}`);
        return;
      }
      if (opts.status) {
        printProgress();
        return;
      }
      await checkBroadcasts("check");

      // Resolve the worktree slug once: it names both the op marker and the
      // full-output log file. The full check transcript is always written here
      // so a failure's real cause is one `cat` away even when the console copy
      // is truncated or piped through `tail`.
      const { slug, branch } = await getWorktreeIdentity();
      const logFile = join(worktreeDataDir(slug), "check.log");

      // Publish the lane: a direct check on the main worktree is human-blocking
      // (interactive), any other direct check is background. publishLane
      // not-clobbers, so a push-nested check keeps the interactive value push.ts
      // set in its env even though it runs on an agent branch. See ../lane.ts.
      const lane: Lane = slug === MAIN_WORKTREE_NAME ? "interactive" : "background";
      publishLane(slug === MAIN_WORKTREE_NAME);

      // Push runs its checks via this command in a subprocess (see push.ts). The
      // parent push already holds a host CPU grant and hands us its unit count in
      // the environment, so `inheritedGrant()` reconstructs it and we spend those
      // units WITHOUT acquiring host-wide again — no double-acquire, no deadlock.
      // A direct `./singularity check` inherits nothing and acquires its own
      // grant via `withHostGrant`.
      const inherited = inheritedGrant();

      // Mark this worktree as having a check in flight so the conversation status
      // poller keeps the agent's pane reading as "working" while the CLI "shell"
      // status persists (see worktree-op.ts), and the op-status banner/chip
      // surface "Check in progress". Written up-front as "waiting-for-lock" and
      // flipped to "running" once the host CPU grant is acquired, so a check
      // queued for its grant reads as queued rather than running. Only for a
      // DIRECT `./singularity check` (no inherited grant); a push-nested check
      // (inherited grant, no wait) is already covered by the push marker, so a
      // second marker would just churn the status.
      const marker = inherited === undefined;

      // The op-log record rides the SAME gate, deliberately: "this check has a
      // marker of its own" and "this check contends for a grant of its own" are
      // one fact, not two. A push-nested check inherits its parent's grant and
      // never queues host-wide — the parent push already accounts for that time,
      // so a second record would double-count it. Until this, a direct check
      // wrote nothing at all: it occupied a grant slot, making every other
      // agent's build and push queue, while appearing nowhere as the cause.
      const profiler = marker
        ? createOpProfiler("check", {
            // A check has no natural id, unlike a push's pushId or a build's
            // buildId — and `opId` must be unique and non-null.
            opId: crypto.randomUUID(),
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
              ? (id, durationMs, wallStartMs) => profiler.recordStep(id, durationMs, wallStartMs)
              : undefined,
            noCache: opts.cache === false,
            scope,
            logFile,
            log: (line, stream) =>
              stream === "stderr" ? console.error(line) : console.log(line),
          };
          return runChecks(checks.length > 0 ? checks : undefined, runOpts);
        };
        const ok = inherited
          ? await runUnder(inherited)
          // `grantHooks()` is what makes this queue visible: this is the wait
          // that made a direct check an invisible contender. On the inherited
          // path there is no profiler and no acquire, so there is nothing to
          // record.
          : await withHostGrant({ lane, max: cpuBudget().B, hooks: profiler?.grantHooks() }, runUnder);
        profiler?.complete(ok ? "success" : "failed");
        if (!ok) {
          // Last line, so it survives `./singularity check | tail`.
          console.error(`\nFull check output: ${logFile}`);
          process.exit(1);
        }
      } finally {
        if (marker) clearWorktreeOp(slug, "check");
      }
    });
}
