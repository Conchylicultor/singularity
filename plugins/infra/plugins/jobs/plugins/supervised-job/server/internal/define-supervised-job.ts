import { z } from "zod";
import {
  abortDurableRun,
  defineJob,
  type JobCtx,
  type JobFactory,
} from "@plugins/infra/plugins/jobs/server";
import {
  defineSupervisedRunKind,
  startSupervisedRun,
  type SupervisedRunKind,
  type SupervisedRunKindSpec,
} from "@plugins/infra/plugins/jobs/plugins/supervised-run/server";
import type { RunTerminal } from "@plugins/infra/plugins/jobs/plugins/supervised-run/core";
import type { SupervisedTaskInvocation } from "@plugins/infra/plugins/jobs/plugins/supervised-task/core";
import { finishSupervisedRun } from "./finish";
import { superviseRuns } from "./loop";
import { spawnClaimedRun } from "./spawn-claimed";
import { runEnded } from "./tables-run-ended";

/** Where a supervised job's child comes from: an argv, and how to run it. */
export interface SupervisedJobSpawn {
  readonly argv: readonly string[];
  readonly cwd?: string;
  /**
   * Entries ADDED to this backend's environment — not a replacement for it.
   * Handed to `startSupervisedRun` unchanged.
   */
  readonly envOverrides?: Record<string, string>;
}

/**
 * The supervised-run kind a job owns: everything `defineSupervisedRunKind` takes
 * except `finish`, which the wrapper assembles, plus the one write `finish`
 * needs.
 *
 * `finish` is not a consumer's to write, because what it must do is fixed: close
 * the row, announce the end, and take no other action. What varies per kind is
 * only the write itself, which is {@link SupervisedJobKindSpec.closeRow}.
 */
export type SupervisedJobKindSpec = Omit<SupervisedRunKindSpec, "finish"> & {
  /**
   * Stamp this run's ledger row with its terminal outcome **if the row is still
   * open** — `WHERE finished_at IS NULL`, and nothing else.
   *
   * **A bare write. No notification, no convergence reconcile, no enqueue.** It
   * runs in the reconciler of every backend that sees the run end, including one
   * that knows nothing about the workflow that started it, so anything with a
   * side effect belongs in {@link DefineSupervisedJobSpec.onEnded} instead,
   * where it happens exactly once.
   *
   * This is the safety net that keeps a kind from wedging: if the owning
   * workflow dies — dead-lettered, or killed in the moment between spawning its
   * child and recording that it did — this is the only thing left that can close
   * the row, and an open row holds the kind's partial unique in-flight index
   * against every future run.
   *
   * In the ordinary case this write is also the one that WINS: it runs before
   * the announcement that eventually resumes the handler, so by the time
   * `onEnded` runs the row is already closed. Write anything beyond the terminal
   * outcome from `onEnded` unconditionally rather than under a
   * `finished_at IS NULL` guard, or it will silently never happen.
   */
  closeRow(runId: string, terminal: RunTerminal): Promise<void>;
};

/** What the wrapper can tell `claim` about the workflow doing the claiming. */
export interface SupervisedJobClaimMeta {
  /**
   * The durable identity of the workflow that will own this run from now until
   * its outcome is recorded.
   *
   * Offered because a consumer that records it on its own ledger row can answer
   * two questions nothing else can: which workflow to cancel alongside the
   * process (see `cancelSupervisedJob`), and — for a row still open with no
   * live workflow behind it — that this run's owner is gone. Ignoring it is
   * fine; nothing in the wrapper reads it back.
   */
  readonly workflowRunId: string;
}

/** What `onEnded` is told beyond the run's own identity and outcome. */
export interface SupervisedJobEndedMeta<I> {
  /** The input this workflow was enqueued with. */
  readonly input: I;
  /** 1-indexed spawn attempt — always 1 unless the job declared `runAttempts`. */
  readonly attempt: number;
}

/**
 * Everything a supervised job declares EXCEPT where its child comes from.
 *
 * Not exported: {@link DefineSupervisedJobSpec} is the only spelling of a spec,
 * and it is the union that makes `argv` and `task` mutually exclusive.
 */
interface SupervisedJobSpecBase<N extends string, S extends z.ZodType> {
  /** Job name, as it appears in the queue (`build.run.supervised`). */
  name: N;
  /** Schema for the value `.enqueue()` takes. Parsed once, at enqueue. */
  input: S;
  /** This job's supervised-run kind — see {@link SupervisedJobKindSpec}. */
  kind: SupervisedJobKindSpec;
  /**
   * Mint this kind's ledger row and answer the id of the run it stands for, or
   * `null` when the claim lost its race.
   *
   * **The claiming INSERT is the lock** — the kind's partial unique index on its
   * own scope `WHERE finished_at IS NULL` is what wins or loses, so a
   * check-then-act before the insert has a TOCTOU window and a lock built on it
   * does not hold. Seed the row with `process.pid` so it does not read as an
   * orphan in the moment before the child's pid is known.
   *
   * Runs inside a memoized step, so it happens exactly once per attempt even
   * across restarts and resumes.
   */
  claim(
    input: z.infer<S>,
    meta: SupervisedJobClaimMeta,
  ): Promise<string | null>;
  /**
   * The run ENDED — do this kind's terminal WORK: the notification, the
   * convergence reconcile, any data beyond the terminal outcome.
   *
   * This is the exactly-once arm. The row itself is already closed by
   * {@link SupervisedJobKindSpec.closeRow}, which runs in the reconciler before
   * the announcement that resumes this handler — so **do not gate work here on
   * the row still being open**, and read the row back rather than assuming
   * anything about who stamped it.
   *
   * Two rules:
   *
   * - **It must be idempotent**, because it is deliberately NOT memoized in a
   *   step. A step that throws is cached as a permanent failure and replays its
   *   error forever, which would make the work most worth retrying the one piece
   *   that never gets a second chance. A retry of the job re-runs this, and the
   *   job's retry budget is what makes a transient failure survivable.
   * - **Throwing here fails the job**, which is correct: a failure to do the
   *   terminal work is the wrapper's own failure, and it earns the retry and the
   *   crash report. A failed CHILD is not — see {@link DefineSupervisedJobSpec}.
   */
  onEnded(
    runId: string,
    terminal: RunTerminal,
    meta: SupervisedJobEndedMeta<z.infer<S>>,
  ): Promise<void>;
  /**
   * How many children may be spawned in sequence while the run keeps failing.
   * Default **1**: a failed build, deploy or backup stays failed and visible,
   * which is what every consumer does today.
   *
   * Each attempt is a NEW run — new id, new transcript, new marker — because
   * out-of-process work cannot be resumed, only redone. Raise it only for work
   * whose failures are genuinely transient AND whose partial effects are safe to
   * repeat.
   */
  runAttempts?: number;
}

/** A child named by a command line — build, release, deploy. */
interface SupervisedJobArgvSource<S extends z.ZodType> {
  /**
   * The command to supervise for this run.
   *
   * May be async, and that is not just convenience: a kind whose environment is
   * assembled from contributions (release collects `APPLE_*` from its
   * `Release.EnvProvider` slot) has to await that assembly, and the values are
   * secrets that must NOT travel through `input` — the job's input is persisted
   * verbatim in the graphile payload. Resolved inside the spawn step, so it runs
   * exactly once per attempt.
   */
  argv(
    input: z.infer<S>,
    runId: string,
  ): SupervisedJobSpawn | Promise<SupervisedJobSpawn>;
  task?: never;
}

/** A child that runs a registered `defineSupervisedTask` body — backup. */
interface SupervisedJobTaskSource<S extends z.ZodType> {
  /**
   * The registered task to run for this run, as
   * `someTask.invoke(payload)`.
   *
   * The alternative to {@link SupervisedJobArgvSource.argv} for work that has no
   * command line of its own: a body assembled from plugin contributions, which
   * `./singularity supervised-exec` boots an `exec` runtime to run. Everything
   * downstream — detach, transcript, marker, reconcile, resume — is identical;
   * only what is spawned differs.
   *
   * The type is not a second spelling of `argv`. A `SupervisedTaskInvocation` is
   * minted ONLY by `SupervisedTask.invoke`, so the id in the argv is a
   * registered id by construction and the payload was checked against that
   * task's own schema at the call site that knows both.
   */
  task(input: z.infer<S>, runId: string): SupervisedTaskInvocation;
  argv?: never;
}

/**
 * What a supervised job declares.
 *
 * A union over WHERE THE CHILD COMES FROM, so declaring both — or neither — is a
 * tsc error rather than a runtime branch: the two are alternatives, and a spec
 * carrying both says nothing about which one wins.
 */
export type DefineSupervisedJobSpec<
  N extends string,
  S extends z.ZodType,
> = SupervisedJobSpecBase<N, S> &
  (SupervisedJobArgvSource<S> | SupervisedJobTaskSource<S>);

/**
 * Resolve this attempt's child command from whichever source the spec declared.
 *
 * A `SupervisedTaskInvocation` already IS a spawn (argv + cwd), so the task arm
 * needs no translation here — which is what keeps the knowledge of the
 * `supervised-exec` verb, and of how a payload is encoded, inside
 * `supervised-task` where it belongs.
 */
async function commandFor<S extends z.ZodType>(
  source: SupervisedJobArgvSource<S> | SupervisedJobTaskSource<S>,
  input: z.infer<S>,
  runId: string,
): Promise<SupervisedJobSpawn> {
  return source.argv !== undefined
    ? await source.argv(input, runId)
    : source.task(input, runId);
}

/**
 * A registered supervised job. One `register:` token mounts both halves — the
 * queue job and the supervised-run kind — because a kind that is defined but not
 * registered is never reconciled, and a job whose kind is missing throws at the
 * spawn.
 */
export interface SupervisedJob<
  N extends string,
  S extends z.ZodType,
> extends JobFactory<N, S, z.ZodNever> {
  /**
   * The supervised-run kind this job owns. Consumers need it to reach the
   * primitive's own operations for a run — `killSupervisedRun` via
   * `cancelSupervisedJob`, most of all.
   */
  readonly kind: SupervisedRunKind;
}

/**
 * Declare a job whose body is a process that outlives the backend that started
 * it.
 *
 * ```ts
 * export const buildJob = defineSupervisedJob({
 *   name: "build.run.supervised",
 *   input: z.object({ trigger: z.enum(["manual", "auto"]) }),
 *   kind: { id: "build", channel: buildLog, listUnfinished, setPid },
 *   claim: (input) => claimBuildRun(input),
 *   argv: (input, runId) => ({ argv: ["./singularity", "build"], cwd: REPO_ROOT }),
 *   onEnded: async (runId, terminal) => { await stampBuildRow(runId, terminal); },
 * });
 * ```
 *
 * Mounted with `register: [buildJob]`, started with `buildJob.enqueue(input)`.
 *
 * What this composes, and what each part is load-bearing for, is in this
 * plugin's CLAUDE.md. The two decisions taken HERE rather than left to a
 * consumer are:
 *
 * - **`hold: "instant"`.** One run of this handler claims a row, spawns a
 *   detached child and suspends — milliseconds. The hold table's reviewer
 *   heuristic is literally "does it spawn?", which would say `minutes` and burn
 *   one of only four slots that can serve long work for the length of a build.
 *   Making it unspellable is the fix; a consumer whose `onEnded` genuinely
 *   exceeds the class ceiling files a slot-hog report naming the real defect.
 * - **`dedup: "none"`.** Not an oversight and not a policy about overlap — the
 *   claim is what prevents overlap. It is protection from a trap in the step
 *   log: `worker.ts` deletes `_jobSteps` / `_jobWaits` only on the completed
 *   path, and a singleton's `workflowRunId` is the constant `${jobName}:_`, so
 *   ONE failed run would leave cached steps and a resolved wait that every later
 *   run replays — skipping the spawn entirely and never building again. A fresh
 *   uuid per enqueue makes that collision unspellable.
 */
export function defineSupervisedJob<N extends string, S extends z.ZodType>(
  spec: DefineSupervisedJobSpec<N, S>,
): SupervisedJob<N, S> {
  const runAttempts = spec.runAttempts ?? 1;
  if (!Number.isInteger(runAttempts) || runAttempts < 1) {
    throw new Error(
      `[supervised-job] ${spec.name}: runAttempts must be a positive integer, got ${String(spec.runAttempts)}`,
    );
  }

  const { closeRow, ...runKind } = spec.kind;
  const kind = defineSupervisedRunKind({
    ...runKind,
    // Close the row, then say the run ended — and nothing else. The outcome
    // does not travel with the announcement (see `RunEndedPayload`) and no
    // consumer work hangs off it: the job handler owns that, and it re-reads
    // the marker rather than believing anything it was told. `finish` runs at
    // most once per run per PROCESS, so an emit can be lost to a restart and
    // must never be the only thing that closes a run — the close above and the
    // handler's bounded wait are the two halves that make that survivable.
    finish: (runId, terminal) =>
      finishSupervisedRun(
        {
          closeRow: (id, outcome) => spec.kind.closeRow(id, outcome),
          announce: (id) => runEnded.emit({ kindId: runKind.id, runId: id }),
        },
        runId,
        terminal,
      ),
  });

  const job = defineJob({
    name: spec.name,
    hold: "instant",
    input: spec.input,
    event: z.never(),
    dedup: "none",
    run: ({ input, ctx }) =>
      runSupervisedJob(spec, kind, runAttempts, input, ctx),
  });

  return {
    ...job,
    kind,
    _kind: "supervised-job",
    _factory: "defineSupervisedJob",
    _doc: { label: spec.name },
    async register() {
      // The kind first: `startSupervisedRun` asserts its kind is registered, and
      // both writes happen in the framework's register phase, before any
      // `onReady` — which is what lets `supervised-run`'s single reconciler see
      // the complete set of kinds when it runs.
      //
      // AWAITED, not fire-and-forget: `Registration.register()` is declared
      // `void | Promise<void>`, so both calls carry a maybe-Promise however
      // synchronous today's implementations are. Dropping either result would
      // let the framework's register phase finish before the write landed.
      await kind.register();
      await job.register();
    },
  };
}

async function runSupervisedJob<N extends string, S extends z.ZodType>(
  spec: DefineSupervisedJobSpec<N, S>,
  kind: SupervisedRunKind,
  runAttempts: number,
  input: z.infer<S>,
  ctx: JobCtx,
): Promise<void> {
  const result = await superviseRuns({
    kind,
    runAttempts,
    ctx,
    spawn: async () => {
      const runId = await spec.claim(input, {
        workflowRunId: ctx.workflowRunId,
      });
      if (runId === null) return null;
      const command = await commandFor(spec, input, runId);
      // From here the ledger row exists, so a failing spawn must not leave it
      // open — an unfinished row IS this kind's lock. See `spawnClaimedRun`.
      const { pid } = await spawnClaimedRun(
        {
          start: () =>
            startSupervisedRun(kind, {
              runId,
              argv: command.argv,
              cwd: command.cwd,
              envOverrides: command.envOverrides,
            }),
          closeRow: (id, outcome) => spec.kind.closeRow(id, outcome),
        },
        runId,
      );
      return { runId, pid };
    },
    onEnded: (started, terminal, attempt) =>
      spec.onEnded(started.runId, terminal, { input, attempt }),
  });

  if (result.outcome === "not-claimed") return;

  // The run is over and its outcome is recorded, so nothing should resume this
  // workflow again. That is not automatic: an iteration the loop skipped (the
  // marker appeared on a replay, before the wait it had already armed was
  // consulted) leaves a pending wait row with a timeout scheduled behind it.
  // Releasing our own suspension state is the same second half of cancellation
  // `cancelSupervisedJob` performs — done here, where the run is finished, and
  // never on a live one.
  await abortDurableRun(ctx.workflowRunId);

  // And that is the end of it. **A non-zero exit code is DATA, not an
  // exception**: this handler's job is to claim, spawn, wait and record, and a
  // build that exits 1 means it did all four. That is a success of the job and a
  // failure of the build, and only the second is news. Throwing would file a
  // crash report and a dead-letter for every failed build — which is not what a
  // failed build is today — and would offer graphile's row retry as a way to
  // "re-run" out-of-process work, which it cannot: the only retry that means
  // anything here is a fresh child, which is `runAttempts`. The failure surfaces
  // where it already does, in the ledger row and the kind's own notification.
  //
  // The wrapper's OWN failures do still throw, from wherever they happen — a
  // failing `onEnded`, a failing claim or spawn, a DB write that will not land.
  // Those earn the retry budget and the report.
}
