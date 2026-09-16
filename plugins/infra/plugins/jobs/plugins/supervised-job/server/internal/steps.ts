import { isSuspendSignal } from "@plugins/infra/plugins/jobs/server";
import { HARD_KILL_EXIT_CODE, type RunTerminal } from "../../core";
import { awaitSupervisedRun, type LoopCtx } from "./loop";
import type { SupervisedRunKind, UnfinishedRun } from "./run/registry";
import { childMayBeRunning } from "./spawn-claimed";

/** Where one child comes from: a command line, and how to run it. */
export interface SupervisedJobSpawn {
  readonly argv: readonly string[];
  readonly cwd?: string;
  /**
   * Entries ADDED to this backend's environment — not a replacement for it.
   * Handed to the supervisor unchanged.
   */
  readonly envOverrides?: Record<string, string>;
}

/** How one step of a `steps` body came out. */
export type StepOutcome =
  /**
   * `beginStep` refused: the run was closed before this step could start, so
   * nothing was spawned and nothing should be. The sequence is over.
   */
  | { readonly state: "run-closed" }
  /**
   * The spawn failed before any child existed (no executable, `EAGAIN`). No
   * child will ever write a marker, so the body records its own verdict — its
   * words, not a hard kill's. The wrapper closes the child's row afterwards as
   * a last resort, if the body left it open (see `runStepsBody`).
   */
  | {
      readonly state: "not-started";
      /** The child id that was never started. */
      readonly runId: string;
      /** Why the spawn failed. */
      readonly message: string;
    }
  /** The step's child ended. `terminal.exitCode` says how. */
  | {
      readonly state: "ended";
      /** The child's id, `${runId}.${name}` — its transcript and marker name. */
      readonly runId: string;
      readonly terminal: RunTerminal;
    };

/**
 * Run one step of a `steps` body: spawn a child and wait for it to end.
 *
 * Only the `{ argv }` form exists. A `{ run }` step — an in-process function run
 * as a child — is not expressible here: the child is a fresh process that must
 * find the body by id in a registry populated at module eval, and a closure
 * written inside a running `steps` body has no such id. A job whose steps need
 * in-process code declares that code as its own `run`-body supervised job and
 * waits on it (the way deploy waits on a release).
 */
export type RunStep = (
  name: string,
  spawn: SupervisedJobSpawn,
) => Promise<StepOutcome>;

/**
 * What the step machinery memoizes under `spawn:<name>`: the child it started,
 * the refusal, or a spawn that started no child.
 *
 * A failed spawn is a VALUE, not a throw: a step that throws is cached as a
 * permanent failure and replays its error on every dispatch, so the body could
 * never record its own verdict and move on.
 *
 * `failed` is also, byte for byte, what deploy's hand-written sequence memoized
 * under the same name before it moved onto `steps` — as is `spawned` (below).
 */
type StepStart =
  | { readonly state: "run-closed" }
  | { readonly state: "started"; readonly runId: string; readonly pid: number }
  | { readonly state: "failed"; readonly message: string };

/**
 * What a replay may find under a step's memo name: {@link StepStart}, or
 * `{ state: "spawned" }` — deploy's pre-`steps` sequence's memo for a leg it
 * started, which carries no pid. A deploy workflow suspended across the release
 * that shipped this resumes on this code, and its memo must re-attach rather
 * than spawn a leg twice — see `resolveRecorded`.
 *
 * The `spawned` arm is removable once no workflow recorded before that release
 * can still be suspended: a deploy's longest wait is one release build.
 */
type RecordedStepStart = StepStart | { readonly state: "spawned" };

/** A step name becomes the suffix of a child id, which becomes a filename. */
const STEP_NAME = /^[A-Za-z0-9_-]+$/;

/** What the step machinery needs from the job and its ledger. */
export interface StepRunnerOpts {
  readonly ctx: Pick<LoopCtx, "step" | "waitFor">;
  readonly kind: SupervisedRunKind;
  readonly runId: string;
  readonly beginStep?: (runId: string, name: string) => Promise<boolean>;
  readonly closeRow: (runId: string, terminal: RunTerminal) => Promise<void>;
  /**
   * The ledger's `listUnfinished` — read only to recover the pid of a child
   * whose memo predates the pid being recorded in it (see `RecordedStepStart`).
   */
  readonly listUnfinished: () => Promise<readonly UnfinishedRun[]>;
  /** Spawn one child detached — the supervisor's `startSupervisedRun`. */
  readonly start: (
    childId: string,
    spawn: SupervisedJobSpawn,
  ) => Promise<{ pid: number }>;
}

/** What one dispatch's steps observed that the wrapper must act on. */
interface StepLedgerNotes {
  /** Children whose spawn started no process: their rows are closed at the end. */
  readonly notStarted: Set<string>;
  /** A spawn threw with a child possibly running: nothing may be closed. */
  childMayBeRunning: boolean;
}

/**
 * Build the `step` function a `steps` body is handed for ONE run.
 *
 * Each call does two things, in this order:
 *
 * 1. **Inside a memoized `ctx.step`**: ask the ledger's `beginStep(runId, name)`
 *    — which records which child a restarted backend should look for, and
 *    refuses when the run was closed meanwhile — then spawn child
 *    `${runId}.${name}`. So a resume re-attaches to the child it already started
 *    and never spawns a second one.
 * 2. **Outside it**: the shared observe-then-wait loop, which suspends the
 *    workflow (holding no slot) until the child's exit marker or a dead pid says
 *    it ended.
 *
 * **A spawn that fails before a child exists** is answered as `not-started`,
 * and its row is NOT closed here: the body records its own verdict first, and
 * `runStepsBody` closes whatever is still open once the body is done. A spawn
 * that failed with a child possibly running throws, and closes nothing — the
 * child will write its own marker.
 *
 * Step names must be unique within a run: the memo and the wait names are keyed
 * by them, so a second step with one name would replay the first.
 *
 * **The durable names are `spawn:<name>` (the memo) and `<name>:<iteration>`
 * (the waits)** — exactly the names deploy's hand-written sequence recorded
 * before it moved onto `steps`, so a deploy suspended across that release
 * re-attaches to the leg it already spawned instead of spawning it again.
 * `steps.test.ts` asserts the literal strings; they may not drift. A body's own
 * `ctx.step` / `ctx.waitFor` names must stay clear of both shapes.
 */
function createStepRunner(
  opts: StepRunnerOpts,
  notes: StepLedgerNotes,
): RunStep {
  const used = new Set<string>();
  return async (name, spawn) => {
    if (!STEP_NAME.test(name)) {
      throw new Error(
        `[supervised-job] ${opts.kind.id}: invalid step name ${JSON.stringify(name)} — ` +
          `letters, digits, "_" and "-" only (it becomes part of a filename).`,
      );
    }
    if (used.has(name)) {
      throw new Error(
        `[supervised-job] ${opts.kind.id}: step ${JSON.stringify(name)} ran twice in run ` +
          `${opts.runId} — step names key the memo and the waits, so they must be unique.`,
      );
    }
    used.add(name);

    const childId = `${opts.runId}.${name}`;
    const recorded = await opts.ctx.step(
      `spawn:${name}`,
      async (): Promise<RecordedStepStart> => {
        if (
          opts.beginStep !== undefined &&
          !(await opts.beginStep(opts.runId, name))
        ) {
          return { state: "run-closed" };
        }
        try {
          const { pid } = await opts.start(childId, spawn);
          return { state: "started", runId: childId, pid };
        } catch (err) {
          if (childMayBeRunning(err)) {
            notes.childMayBeRunning = true;
            throw err;
          }
          return {
            state: "failed",
            message: err instanceof Error ? err.message : String(err),
          };
        }
      },
    );
    if (recorded.state === "failed") {
      // Recorded on a replay too, so a dispatch that died before its close
      // landed is closed by the next one that reaches the end.
      notes.notStarted.add(childId);
      return {
        state: "not-started",
        runId: childId,
        message: recorded.message,
      };
    }
    const started = await resolveRecorded(recorded, childId, opts);
    if (started.state === "run-closed") return started;

    const terminal = await awaitSupervisedRun(opts.ctx, {
      kind: opts.kind,
      runId: started.runId,
      pid: started.pid,
      name,
    });
    return { state: "ended", runId: started.runId, terminal };
  };
}

/**
 * Run a `steps` body for one run, and guarantee that a child which never
 * started does not leave its row — the job's lock — open.
 *
 * **The body goes first.** A `not-started` step is handed to the body as a
 * value, so it can record its own verdict in its own words (deploy's
 * "could not run …"). Only when the body is DONE — returned, or thrown
 * anything but a suspend signal — does the wrapper call `closeRow` with the
 * hard-kill sentinel for each such child. `closeRow` is first-writer-wins, so
 * after a body that stamped its run this is a no-op; after a body that forgot,
 * or crashed first, it is what keeps the kind from refusing every future run.
 * So the guarantee is structural, not a note asking each body to remember.
 *
 * Nothing is closed on a suspend (the body chose to keep going, and its replay
 * re-reads the memo and closes at the real end), nor when any spawn threw with
 * a child possibly running — releasing the lock under a live child duplicates
 * the run, which is worse than a wedge.
 *
 * If the close itself fails, it travels with the body's error (if any) in an
 * `AggregateError`: at that point the kind is wedged until a restart.
 */
export async function runStepsBody(
  opts: StepRunnerOpts & {
    readonly body: (step: RunStep) => Promise<void>;
  },
): Promise<void> {
  const notes: StepLedgerNotes = {
    notStarted: new Set(),
    childMayBeRunning: false,
  };
  const step = createStepRunner(opts, notes);
  try {
    await opts.body(step);
  } catch (bodyError) {
    if (isSuspendSignal(bodyError)) throw bodyError;
    await closeNotStarted(opts, notes, bodyError);
    throw bodyError;
  }
  await closeNotStarted(opts, notes, undefined);
}

async function closeNotStarted(
  opts: StepRunnerOpts,
  notes: StepLedgerNotes,
  bodyError: unknown,
): Promise<void> {
  if (notes.childMayBeRunning) return;
  for (const childId of notes.notStarted) {
    try {
      await opts.closeRow(childId, {
        exitCode: HARD_KILL_EXIT_CODE,
        signalCode: null,
        finishedAt: new Date(),
      });
    } catch (closeError) {
      throw new AggregateError(
        bodyError === undefined ? [closeError] : [bodyError, closeError],
        `[supervised-job] ${opts.kind.id}: child ${childId} never started AND its ledger row ` +
          `could not be closed — the kind's in-flight lock is held until this backend restarts.`,
      );
    }
  }
}

/**
 * Read a started (or legacy `spawned`) memo as the child it names.
 *
 * A legacy `spawned` memo carries no pid. The pid is what `awaitSupervisedRun`
 * applies the close rule with, so it is recovered from the ledger: a child still
 * listed as unfinished has its recorded pid; one no longer listed was closed —
 * by its marker, or by the reconciler writing it off — so `null` is right for it
 * (the marker, if any, is read first; with none, the reconciler already recorded
 * the hard kill this answers).
 */
async function resolveRecorded(
  recorded: Exclude<RecordedStepStart, { state: "failed" }>,
  childId: string,
  opts: Pick<StepRunnerOpts, "listUnfinished">,
): Promise<
  | { readonly state: "run-closed" }
  | {
      readonly state: "started";
      readonly runId: string;
      readonly pid: number | null;
    }
> {
  switch (recorded.state) {
    case "run-closed":
    case "started":
      return recorded;
    case "spawned": {
      const unfinished = await opts.listUnfinished();
      const row = unfinished.find((run) => run.runId === childId);
      return { state: "started", runId: childId, pid: row?.pid ?? null };
    }
  }
}
