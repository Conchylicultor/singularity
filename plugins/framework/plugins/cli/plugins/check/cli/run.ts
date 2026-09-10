import type { CliAction } from "@plugins/framework/plugins/cli/core";
import { withDirectOp } from "@plugins/framework/plugins/cli/plugins/op-runtime/cli";
import { inheritedGrant } from "@plugins/infra/plugins/host/plugins/host-admission/server";
import { cpuBudget } from "@plugins/infra/plugins/host/plugins/host-admission/core";
import { worktreeArtifacts } from "@plugins/infra/plugins/paths/server";
import {
  listAllChecks,
  readCheckProgress,
  runChecks,
  requestedJobs,
  scopeOf,
  type RunChecksOptions,
} from "@plugins/framework/plugins/tooling/plugins/checks/core";
import {
  CHECK_SCOPES,
  type CheckScope,
} from "@plugins/framework/plugins/tooling/core";

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
    // Three numbers, not two, because the runner gates its fan-out: a check
    // that has not started is now a normal state (waiting for a slot) rather
    // than an impossible one. Reporting only "settled / outstanding" under a
    // bound would make a healthy run look like it had lost most of its work —
    // 18 running out of 100 selected, with nothing said about the other 82.
    // The queued set is derived from the same records (`selected` minus
    // everything that ever started), so it cannot disagree with them. It is
    // non-null exactly when `selected` is — both come off the one `selected`
    // record — and the branch above has already returned for that case; they
    // are separate fields, so the `??` is the pairing TS cannot state.
    const queued = run.queued ?? [];
    console.log(
      `  ${run.outstanding.length} running, ${queued.length} queued, ` +
        `${run.endedCount}/${run.selected.length} settled`,
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

/**
 * The check run itself. Reached only once commander has routed to `check`, so
 * everything above — the checks registry, the host-admission grant, the op
 * profiler and the worktree-op marker — stays off every other command's path.
 *
 * `checks` is the variadic positional: an empty array when no id was typed,
 * which is how "run every check" is spelled below (`checks.length > 0 ? … :
 * undefined`). `opts.cache` is commander's negatable `--no-cache`, so the test
 * is `=== false` — `undefined`/`true` both mean the cache is live.
 */
const run: CliAction<
  [string[]],
  {
    list?: boolean;
    status?: boolean;
    cache?: boolean;
    scope?: string;
    alwaysRun?: boolean;
    runId?: string;
    jobs?: string;
  }
> = async (checks, opts) => {
  // Validate before anything else: an unrecognized scope must NOT fall
  // through to `scope: undefined`, which means "every scope" — a typo would
  // then silently run MORE than asked and report a pass. EVERY part of a
  // comma-separated list is validated for the same reason: one good part must
  // not carry a typo'd sibling through.
  let scope: CheckScope[] | undefined;
  if (opts.scope !== undefined) {
    const parts = opts.scope.split(",").map((s) => s.trim());
    const unknown = parts.filter(
      (s) => !(CHECK_SCOPES as readonly string[]).includes(s),
    );
    if (unknown.length > 0) {
      console.error(
        `Unknown --scope ${unknown.map((s) => `"${s}"`).join(", ")}. ` +
          `Expected one of: ${CHECK_SCOPES.join(", ")} (comma-separated for several).`,
      );
      process.exit(1);
    }
    scope = parts as CheckScope[];
  }

  // NESTING is resolved by `withDirectOp` below (a parent op hands this child
  // its host CPU grant in the environment). It is read once more here, ahead of
  // the lifecycle, for the one rule that is this command's own: `--run-id`.
  const nested = inheritedGrant() !== undefined;

  // `--run-id` is meaningful ONLY for a nested check. A top-level check
  // must mint its own id, because that id also names its op-log row and its
  // kill line — reusing a parent's would collide with the parent's own
  // records. `withDirectOp` honours whatever id it is handed; this is the
  // validation that keeps a top-level check from handing it one.
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

  // Validated once the two PURE READS above have returned, and not before.
  // Refusing early is right for a run — `runChecks` validates this too, but it
  // does so inside `withHostGrant`, so a typo'd `--jobs` would queue for a host
  // CPU slot (minutes, under load) just to be told it was a typo. But `--list`
  // and `--status` acquire no grant and run no check, and `--status` is the tool
  // you reach for from a second shell WHILE a run is wedged. A stale
  // `SINGULARITY_CHECK_JOBS=auto` in a shell profile must not be what stops you
  // reading the progress log during an incident.
  //
  // Deliberately the runner's own `requestedJobs`, not a second check that
  // happens to agree today: one rule about one number, called from both ends.
  // The return value is discarded — this call is for its throw. It covers the
  // env var too, which the runner reads itself.
  requestedJobs(opts.jobs !== undefined ? Number(opts.jobs) : undefined);

  // Everything from here on — the broadcast banner, this worktree's identity,
  // the interrupted-predecessor warning, the lane, the op marker, the op-log
  // record, the signal handlers and the host grant (or the parent's inherited
  // one) — is the direct-op lifecycle, shared with `test` and the e2e branch of
  // `run`. See op-runtime/cli/direct-op.ts. What is left here is what only a
  // check knows: how to run the checks, and what their verdict means.
  //
  // A nested check adopts its parent's id (`--run-id`, validated above), so
  // the child's transcript and progress records name the op a human is
  // actually looking at; a top-level check mints its own inside the primitive.
  const outcome = await withDirectOp(
    "check",
    { max: cpuBudget().B, opId: opts.runId },
    async (grant, ctx) => {
      // This run's transcript: `check-<opId>.log` sits in the worktree's data
      // dir beside a build's artifacts, so the three records of one run (op
      // row, kill line, transcript) all answer to the same id. Derived here
      // rather than passed in, so the path this prints and the path the runner
      // writes are the same expression.
      const checkLogPath = worktreeArtifacts.checkLog(ctx.slug, ctx.opId);
      const { profiler } = ctx;
      const runOpts: RunChecksOptions = {
        grant,
        // One step per individual check, so a `check` bar drills in to
        // `type-check` / `eslint` / … — the affordance `build` already has
        // via the same hook (build.ts → `pushBuildSpan`). Gated on the
        // profiler, i.e. on not being nested: a push-nested check must write
        // no record of its own, and therefore no steps either.
        //
        // `onCheckDone` reports a check that has ALREADY finished, so this
        // must be `recordStep` (duration + start supplied) and never
        // `stepStart`/`stepEnd` (which read the clock themselves and would
        // stamp the check's end as its start).
        //
        // CLOCK. `wallStartMs` is a `performance.now()` reading (runner.ts)
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
        // Commander hands every `<n>` option through as a string, so the
        // conversion happens here and the VALIDATION does not: `runChecks`
        // rejects anything that is not a positive integer, with one message
        // covering both this flag and SINGULARITY_CHECK_JOBS (which it reads
        // itself — that is the knob `build` and `push` reach, since they spawn
        // this command and inherit the environment). Splitting the check across
        // both sites would be two rules that could disagree about the same
        // number, so `Number("x")` is passed on as `NaN` for the runner to
        // reject by name.
        jobs: opts.jobs !== undefined ? Number(opts.jobs) : undefined,
        scope,
        alwaysRun: opts.alwaysRun === true,
        logRun: { worktree: ctx.slug, runId: ctx.opId },
        log: (line, stream) =>
          stream === "stderr" ? console.error(line) : console.log(line),
      };
      const ok = await runChecks(
        checks.length > 0 ? checks : undefined,
        runOpts,
      );
      // Last line, so it survives `./singularity check | tail`.
      if (!ok) console.error(`\nFull check output: ${checkLogPath}`);
      return ok ? "success" : "failed";
    },
  );
  if (outcome !== "success") process.exit(1);
};

export default run;
