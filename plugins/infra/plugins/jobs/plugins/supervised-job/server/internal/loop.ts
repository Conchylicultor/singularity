import type { JobCtx } from "@plugins/infra/plugins/jobs/server";
import type { RunTerminal } from "@plugins/infra/plugins/jobs/plugins/supervised-run/core";
import {
  assertRegistered,
  type SupervisedRunKind,
} from "@plugins/infra/plugins/jobs/plugins/supervised-run/server";
import { observeRun } from "./observe";
import { runEnded, type RunEndedPayload } from "./tables-run-ended";

/**
 * How long one suspension waits for `supervisedRun.ended` before waking anyway.
 *
 * The wait is bounded rather than `unbounded: true`, and the bound is what makes
 * a lost wake-up cost a delay instead of a run. Two independent things already
 * re-announce a live run — the supervising backend's own reconcile pass every
 * 60 s, and the boot reconcile of whatever backend comes up next — so this only
 * has to cover the case where NEITHER can: a kind whose own CLI stamped its
 * ledger row early (`./singularity build` does, ~100 s before its child exits)
 * has already left `listUnfinished`, so a backend that restarts after the marker
 * landed will never re-announce it, and this timeout is the only thing that ever
 * closes the workflow.
 *
 * Five minutes is chosen against that cost, not against a latency target: a wake
 * is two `instant` dispatches and one `stat`, so a 30-minute build pays six of
 * them, and the worst-case lateness of a run's recorded outcome is one interval.
 * Shortening it buys nothing the 60 s reconcile does not already provide on a
 * live backend; lengthening it delays exactly the restart case it exists for.
 */
const RUN_ENDED_WAIT_MS = 5 * 60 * 1000;

/**
 * Wait until one supervised run has ended, and answer HOW it ended.
 *
 * The observe-then-wait loop, exported because it is the whole of the close rule
 * in motion and a second copy of it would be a path nothing exercises until
 * something has already gone wrong. `superviseRuns` below calls it, so it sits
 * on the hot path rather than beside it and cannot drift from what every
 * supervised job depends on.
 *
 * **Observe first, wait second.** The marker is checked BEFORE every suspension,
 * which closes a race that would otherwise strand short runs:
 * `startSupervisedRun` settles a run whose marker is already on disk by the time
 * the spawn returns, so its announcement can fire while the caller is still
 * inside its spawn step, with no trigger armed to receive it. A wait-first loop
 * would then hang until its timeout on a run that was over before it started.
 * Observing first makes the wait a pure wake-up: losing one costs a timeout,
 * never the run.
 *
 * **The wait names are `${name}:${iteration}`**, so they are deterministic per
 * caller and per iteration. A replay after a resume re-walks the same names in
 * the same order: a settled wait row returns immediately (resolved or timed out)
 * and falls through to the next iteration, while only the first not-yet-settled
 * name arms a trigger — so a duplicate trigger for one iteration is not
 * expressible. Pass a `name` that is stable for the position in YOUR workflow
 * (`converge`, `ship`), never one derived from a clock or a counter that can
 * restart differently.
 *
 * **PRECONDITION: `pid` must be the pid of a child YOU started for this run.**
 * With no marker on disk, a pid that is not alive IS the hard-kill outcome —
 * that is the close rule, and it is correct for a row with no process behind it.
 * So `pid: null` returns the `-1` sentinel immediately, which is right for a run
 * you started and wrong for a run you merely know the id of. The worked example
 * is deploy's `update`: it waits on its own converge and ship legs through this
 * function, but its wait on the RELEASE leg — a run of someone else's kind,
 * whose pid it does not hold and which may not even have been claimed yet — must
 * NOT come here. That one resolves against `release_runs` instead.
 */
export async function awaitSupervisedRun(
  ctx: Pick<JobCtx, "waitFor">,
  opts: {
    /**
     * The kind handle, not an id: a handle can only be obtained by having
     * defined the kind, which makes waiting on a kind you do not own hard to
     * spell by accident.
     */
    readonly kind: SupervisedRunKind;
    readonly runId: string;
    /** The pid of the child you started — see the precondition above. */
    readonly pid: number | null;
    /** Stable prefix for this wait's position in your workflow. */
    readonly name: string;
  },
): Promise<RunTerminal> {
  // A kind nobody registered is a kind whose runs nothing reconciles and whose
  // end nothing announces, so this wait would burn its timeout forever. Loud at
  // the call site, exactly as `startSupervisedRun` is.
  assertRegistered(opts.kind);
  for (let iteration = 0; ; iteration++) {
    const observation = observeRun(opts.kind.id, opts.runId, opts.pid);
    if (observation.state === "ended") return observation.terminal;
    // The payload is discarded, deliberately — this is a wake-up, and the marker
    // is the authority. `null` (the timeout arm) and an event are the same
    // instruction here: go and look.
    await ctx.waitFor<RunEndedPayload>(runEnded, {
      where: { kindId: opts.kind.id, runId: opts.runId },
      timeoutMs: RUN_ENDED_WAIT_MS,
      name: `${opts.name}:${iteration}`,
    });
  }
}

/**
 * What this loop needs from a job context: memoized steps, and the durable wait.
 *
 * Structurally satisfied by `JobCtx`, so the handler passes `ctx` straight
 * through. Declared narrowly because the loop's correctness rests on exactly two
 * properties of the surrounding machinery — a step runs once per workflow run
 * and replays its result thereafter, and a wait suspends and resumes under a
 * name — so a test supplying both is exercising the real algorithm rather than a
 * rehearsal of it.
 */
export type LoopCtx = Pick<JobCtx, "step" | "waitFor">;

/** One spawned child: the run it serves, and the process group it lives in. */
export interface StartedRunAttempt {
  readonly runId: string;
  readonly pid: number;
}

export interface SuperviseRunsSpec {
  /** The supervised-run kind these attempts belong to. */
  readonly kind: SupervisedRunKind;
  /** How many children may be spawned in sequence before giving up. */
  readonly runAttempts: number;
  readonly ctx: LoopCtx;
  /**
   * Claim the ledger row and spawn the child for `attempt`, or answer `null`
   * when the claim lost its race with a run that is already in flight.
   *
   * Called inside a step, so it happens exactly once per attempt per workflow —
   * a resume must never spawn a second child for a run it already started.
   */
  spawn(attempt: number): Promise<StartedRunAttempt | null>;
  /**
   * The run has ENDED — stamp its row and do this kind's terminal work. Called
   * once per attempt that reached a terminal, before the next attempt claims.
   */
  onEnded(
    started: StartedRunAttempt,
    terminal: RunTerminal,
    attempt: number,
  ): Promise<void>;
}

export type SuperviseRunsResult =
  /** The claim lost its race: another run of this kind is already in flight. */
  | { readonly outcome: "not-claimed" }
  /** The last attempt reached a terminal. `terminal.exitCode` says which. */
  | {
      readonly outcome: "ended";
      readonly runId: string;
      readonly attempt: number;
      readonly terminal: RunTerminal;
    };

/**
 * Spawn a supervised run, wait for it to end, and repeat up to `runAttempts`
 * times while it keeps failing.
 *
 * The whole shape of a supervised job lives here, and it is short at both ends
 * and empty in the middle: spawn and suspend, then be woken and read the marker.
 * Nothing holds a worker slot while a child runs — {@link SuperviseRunsSpec.wake}
 * RETURNS from the handler through the jobs plugin's suspend sentinel, and the
 * workflow comes back as a fresh dispatch.
 *
 * **Observe first, wait second.** The check that decides whether to keep waiting
 * runs BEFORE every suspension, not after it, and that ordering closes a race
 * that would otherwise strand short runs forever: `startSupervisedRun` settles a
 * run whose marker is already on disk by the time the spawn returns, so its
 * `finish` — and therefore the `supervisedRun.ended` emit — can fire while this
 * handler is still inside the spawn step, with no trigger armed to receive it.
 * A wait-first loop would then hang until its timeout on a run that was over
 * before it started. Observing first makes the wait a pure wake-up: losing one
 * costs a timeout, never the run.
 *
 * **A retry is a new child.** When `runAttempts > 1`, the next iteration calls
 * `spawn` again and gets a fresh run id, a fresh transcript and a fresh marker —
 * out-of-process work cannot be resumed, only redone. `onEnded` runs before the
 * next claim, deliberately: it is what stamps the previous attempt's row, and
 * the kind's partial unique in-flight index would refuse the next claim while
 * that row is still open.
 */
export async function superviseRuns(
  spec: SuperviseRunsSpec,
): Promise<SuperviseRunsResult> {
  let last: SuperviseRunsResult = { outcome: "not-claimed" };
  for (let attempt = 1; attempt <= spec.runAttempts; attempt++) {
    const started = await spec.ctx.step(`spawn:${attempt}`, () =>
      spec.spawn(attempt),
    );
    if (started === null) return { outcome: "not-claimed" };

    // `run-ended:<attempt>` as the prefix, so the durable wait names come out
    // `run-ended:<attempt>:<iteration>` — the spelling every supervised job has
    // used since this loop existed, and one an in-flight workflow's recorded
    // waits are keyed by. `loop.test.ts` asserts the literal strings.
    const terminal = await awaitSupervisedRun(spec.ctx, {
      kind: spec.kind,
      runId: started.runId,
      pid: started.pid,
      name: `run-ended:${attempt}`,
    });
    await spec.onEnded(started, terminal, attempt);
    last = { outcome: "ended", runId: started.runId, attempt, terminal };
    if (terminal.exitCode === 0) break;
  }
  return last;
}
