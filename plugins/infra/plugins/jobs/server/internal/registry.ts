import { randomUUID } from "node:crypto";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { TaskSpec } from "graphile-worker";
import type { PoolClient } from "pg";
import type { z } from "zod";
import type { Registration } from "@plugins/framework/plugins/server-core/core";
import {
  ceilingMsFor,
  priorityFor,
  taskFor,
  type HoldClass,
} from "../../core/hold";
import { DEFAULT_MAX_ATTEMPTS } from "./constants";
import { withQueueSchemaAssert } from "./queue-schema";
import type { WaitForOptions } from "./step-ctx";
import { getWorkerUtils } from "./worker";

export { DEFAULT_MAX_ATTEMPTS } from "./constants";

/**
 * Drizzle node-postgres database/transaction handle. Both `db` and the
 * `tx` passed by `db.transaction(...)` match this type — `NodePgTransaction`
 * extends `NodePgDatabase`. Use the `tx` form when you need the job INSERT
 * to participate in your transaction (rollback drops the job alongside
 * your writes).
 */
export type EnqueueTx = NodePgDatabase<Record<string, never>>;

export interface JobCtx {
  /**
   * Graphile job id. Stable across retries of a single failed job, distinct
   * per emit. Use as the dedup key in event-triggered handlers: non-oneShot
   * subscribers MUST dedup on `jobId` rather than the trigger row's UUID,
   * which is identical for every emit of the same trigger.
   */
  jobId: string;
  /** 1-indexed attempt number — starts at 1 on the first try. */
  attempt: number;
  /**
   * Stable identity for this workflow run across suspends and resumes.
   * For `dedup: "singleton"` or `dedup: { key }`, this is
   * `${jobName}:${effectiveKey}` (namespaced so two different jobs
   * picking the same natural id don't collide on `_jobWaits` /
   * `_jobSteps`); for `dedup: "none"`, a generated uuid.
   * Used as the key for the step and wait logs.
   */
  workflowRunId: string;
  /**
   * Aborted when THIS dispatch has used up its execution budget — the wall-clock
   * time one run of this handler may spend holding a worker slot. (The budget
   * itself lands in a later phase; today nothing fires this signal, so it is a
   * signal that stays unaborted for the handler's whole life. Threading it now is
   * free and means the budget arrives without touching call sites.)
   *
   * **Thread it into anything that accepts one.** `fetch`, child processes, gate
   * and pool acquisition — anywhere the handler can wait. Aborting the signal is
   * the ONLY lever the worker has: it cannot un-await a promise. So a handler that
   * ignores it does not stop when its budget expires; it keeps running, invisibly,
   * after its job row has already been recorded as failed. That is the shape of
   * both wedges on 2026-08-17 — an un-timed `await browser.close()` inside a
   * semaphore, and an un-timed `git worktree remove` inside a host-wide flock —
   * which between them held all four slots of the pool for 70 minutes while 690
   * jobs piled up behind them
   * (`research/2026-08-17-global-bounded-job-execution.md`).
   *
   * **This is NOT graphile's `helpers.abortSignal`.** That one is runner-level and
   * fires on worker SHUTDOWN. We deliberately do not use it and deliberately do
   * not wire the two together: "the process is going down" wants you to stop
   * cleanly and let the row be retried elsewhere, while "this one run overran"
   * wants a loud, attributed failure against this job. Conflating them would make
   * an ordinary deploy look like 4 jobs blowing their budget, and a genuine
   * overrun look like a restart.
   *
   * **A long WAIT is not a long RUN — use `ctx.waitFor` / `ctx.sleep` for it.**
   * Those RETURN from `run` (via the suspend sentinel), releasing the worker slot;
   * the workflow resumes later as a fresh dispatch with a fresh budget. So a
   * workflow may legitimately span days while every one of its runs stays short.
   * That is precisely why bounding execution is safe: nothing correct needs to
   * hold a slot for a long time. If you find yourself wanting a bigger budget in
   * order to wait for something, you want a suspend instead.
   *
   * **Why this is not the liveness inference this plugin bans** (see the top of
   * `jobs/CLAUDE.md`, and the ~25 live jobs the old age-based lease stole in 8
   * days): the banned claim is third-person and made about a stranger — "this row
   * has been locked for T, therefore its owner is dead, therefore I may re-dispatch
   * it" — which no clock can support. This is first-person: the process aborting
   * the handler is the same process running it and holding its advisory lock, so
   * it is saying "I am giving up on my own work", never "someone else must be
   * gone". Nothing here moves a job row, and the invariant downstream is unchanged
   * — a row is still reclaimed only when its lock is provably absent from
   * `pg_locks`. A budget bounds how long "alive" may last; it never decides who is
   * alive.
   */
  readonly signal: AbortSignal;
  /**
   * Run `fn` exactly once per `workflowRunId` and memoize its result in
   * `_job_steps`. On replay (retry or resume), returns the cached result
   * without calling `fn`. Any non-idempotent side effect (sending a turn,
   * writing a DB row, hitting an external API) MUST go inside `ctx.step`.
   */
  step<R>(name: string, fn: () => Promise<R> | R): Promise<R>;
  /**
   * Subscribe to `event` (optionally filtered by `where`), suspend the
   * handler, and return the event payload once it fires. Returns `null` on
   * timeout. Every wait is bounded by construction: `opts.timeoutMs` defaults
   * to {@link DEFAULT_WAIT_TIMEOUT_MS} and is clamped to {@link
   * MAX_WAIT_TIMEOUT_MS} — pass `opts.unbounded: true` for the rare
   * genuinely-forever wait. DO NOT wrap in try/catch — suspend is signaled by a
   * sentinel error that the worker catches; swallowing it hangs the workflow.
   * If you must catch (e.g. wrapping in your own retry), gate the catch on
   * `isSuspendSignal(err)` and re-throw.
   */
  waitFor<T extends Record<string, unknown>>(
    event: {
      readonly __kind: "event";
      readonly def: { name: string };
      readonly filter: Record<string, unknown>;
    },
    opts?: WaitForOptions<T>,
  ): Promise<T | null>;
  /**
   * Suspend until `ms` have elapsed. Same try/catch caveat as `waitFor` —
   * if you must catch around `ctx.sleep`, re-throw via `isSuspendSignal`.
   */
  sleep(ms: number): Promise<void>;
}

export interface RegisteredJob {
  name: string;
  /** Duration class declared via `defineJob({ hold })` — see the field's doc on
   * {@link DefineJobSpec}. Read by the worker to pick the graphile task and
   * priority a row is inserted on, and by the slow-op pipeline for the class's
   * work-time ceiling. */
  hold: HoldClass;
  inputSchema: z.ZodType;
  /**
   * Schema for the event payload delivered alongside `input` when the job
   * is invoked via the events dispatcher. `z.never()` declares that the
   * job ignores events — the dispatcher skips event parsing and passes
   * `event: undefined`. Direct enqueues always pass `event: undefined`
   * regardless of the schema (Layer-1 has no event source).
   */
  eventSchema: z.ZodType;
  dedup: "singleton" | "none" | "keyed";
  run: (args: {
    input: unknown;
    event: unknown;
    ctx: JobCtx;
  }) => Promise<void> | void;
  maxAttempts: number;
  /** Per-job slow-op threshold (ms), if declared. When a run exceeds this the
   * slow-ops pipeline files a report; falls back to the `slow-op` config
   * `jobMs` default when unset. */
  slowThresholdMs?: number;
  /** Recurring schedule, if the job declared one. Read by the worker at
   * startup to build graphile-worker cron items. */
  schedule?: ScheduleSpec;
  /** Serialization lane, if the job declared one (see {@link SerialSpec}).
   * Read through {@link queueNameFor} by every enqueue path, so the queue name
   * is a property of the registered job rather than of any call site. */
  serial?: SerialSpec;
  /**
   * Enqueue by the registered job's public factory. Exposed here so the
   * builtin `jobs.resume` can re-enqueue a target by name without holding
   * a typed `JobFactory` reference.
   */
  enqueue: (input: unknown, opts?: EnqueueOpts) => Promise<{ jobId: string }>;
}

export interface EnqueueOpts {
  maxAttempts?: number;
  runAt?: Date;
  /**
   * Insert the job into `graphile_worker.jobs` on the same connection as
   * this Drizzle transaction. The job is enqueued atomically with your
   * writes — rollback drops it. Without `tx`, `enqueue` uses Graphile's
   * own pool and the job commits independently of any caller transaction
   * (current default; safe for post-commit emit).
   */
  tx?: EnqueueTx;
  /**
   * Event payload threaded by the events dispatcher. Stored in the
   * graphile queue row and delivered to the handler as `event`. Internal
   * plumbing — only the dispatch job should set this.
   */
  _event?: unknown;
}

export type Dedup<S extends z.ZodType> =
  "singleton" | "none" | { key: (input: z.infer<S>) => string };

/**
 * Declares that runs of this job must not overlap — `true` serializes the job
 * against itself, `{ with: "<lane>" }` serializes it against every other job
 * naming the same lane (one Chromium at a time across several job names).
 *
 * **This is not a semaphore, and the difference is the entire point.** An
 * in-process gate — `createSemaphore(1)`, a mutex, an async queue — is entered
 * AFTER graphile has already handed the job to a worker, so a job waiting on it
 * is holding a slot from the shared pool while it waits. On 2026-08-17 main's
 * queue stopped for 70 minutes and three of its four slots came from ONE bug:
 * `prototypes.render-thumbnail` guarded Chromium with a process-local
 * `createSemaphore(1)`, one run wedged holding the permit, and the next two
 * renders were dequeued and then blocked forever *waiting for it* — each
 * occupying a slot to do nothing. An in-process gate entered after dispatch
 * turns one stuck job into N stuck slots.
 *
 * `serial` moves the wait to BEFORE dispatch. It is plumbed to graphile's
 * `queue_name`, and graphile's fetch query (`dist/sql/getJob.js:72-74`) filters
 * candidate rows on `job_queues.is_available = true` — so a job whose queue is
 * busy is never fetched and never occupies a slot at all. Waiting becomes free,
 * and a wedged serialized job shows up as ready backlog (already attributed per
 * jobName by queue-health) rather than as invisible slot exhaustion.
 *
 * **Scope: per-database, i.e. per worktree backend.** graphile's queue lock is a
 * row in this database's `graphile_worker._private_job_queues`, and every
 * worktree backend runs its own worker against its own DB fork. So `serial`
 * bounds THIS backend — exactly the scope `createSemaphore(1)` had, and exactly
 * the scope it replaces. It says nothing about the other ~16 backends on the
 * box. Host-wide bounds are a different mechanism and remain
 * `infra/host-admission`'s job; reach for that when the resource is the machine
 * (CPU, RAM, a shared directory), and for `serial` when the resource is this
 * process.
 *
 * **Queue names must come from a small FIXED set — never from the input.**
 * graphile picks its fetch strategy on whether named queues exist at all: with
 * none it uses the fastest path, and the moment any exist it switches to
 * strategy 2, which its own benchmark comment (`dist/sql/getJob.js`, ~lines
 * 30-60) measures at ~843 jobs/s against ~11.8k for strategy 0. That is ample
 * for this queue's volume, but the same comment calls a distinct queue name per
 * job instance ("randomly generating queue names") pathological, at roughly
 * 40 jobs/s. So serialize on the RESOURCE — the browser, the git checkout, the
 * external API — and never on the payload: `serial: true` on a thumbnail
 * renderer is right; a queue per prototype slug is the pathological case.
 */
export type SerialSpec = true | { readonly with: string };

export interface ScheduleSpec {
  /**
   * Standard 5-field crontab (`m h dom mon dow`, UTC) describing when this
   * job runs — or a resolver evaluated once at worker startup that may read
   * config and return `null`/`""` to disable scheduling (e.g. a user setting).
   *
   * Backed by graphile-worker's native cron. graphile's `known_crontabs`
   * dedup is **per-database** only — and every worktree backend runs its own
   * worker against its own per-worktree DB, so there is NO fleet-wide dedup.
   * To avoid a cron firing once per live worktree, schedules are installed on
   * the main runtime only by default (see {@link perWorktree}). A failed tick
   * never breaks the schedule — the next tick is independent. No boot
   * backfill. Manual `enqueue()` is unaffected and still works on every
   * runtime for on-demand runs.
   */
  cron: string | (() => string | null);
  /**
   * Run this schedule in EVERY worktree backend, not just main. Default
   * `false` — schedules are main-only.
   *
   * Leave this off (the default) for any job that touches shared/global state
   * — external uploads, the shared `~/.singularity` filesystem, secrets — or
   * canonical data that lives in the main DB. Running such a job per-worktree
   * duplicates the work once per live worktree (e.g. N backup uploads) or
   * races on the shared resource.
   *
   * Set `true` ONLY when the job acts solely on its own worktree's state AND
   * that work is genuinely wanted for every ephemeral worktree — a rare case.
   */
  perWorktree?: boolean;
}

/**
 * Everything a job declares that is independent of whether it is scheduled.
 * Not exported: {@link DefineJobSpec} is the only spelling of a job spec, and
 * it is the union that carries the scheduled ⇒ singleton invariant.
 */
interface BaseJobSpec<
  N extends string,
  S extends z.ZodType,
  E extends z.ZodType,
> {
  name: N;
  /**
   * The timescale one RUN of this handler occupies a worker slot. Not workflow
   * duration: `ctx.waitFor` / `ctx.sleep` RETURN from `run` and release the slot,
   * so a workflow may span days while every one of its runs is `instant`.
   *
   * **Declared from what BOUNDS the handler, not from its observed mean.** A
   * model call with a 30s timeout is `seconds` however fast it usually returns.
   * - `instant` — no blocking I/O: indexed reads/writes, in-memory work. Check
   *   it by asking: no network, no spawn, no model call?
   * - `seconds` — a timeout the handler passes itself (`grep timeoutMs` in the
   *   handler).
   * - `minutes` — nothing short of the work bounds it: does it spawn, render,
   *   or upload?
   *
   * This is the only declaration of a job's duration class. It picks the
   * reservation tier today and, when
   * `research/2026-08-17-global-bounded-job-execution.md` Phase 2 lands, the
   * deadline that aborts `ctx.signal`. There is deliberately no second field, so
   * a lane and a budget cannot disagree.
   */
  hold: HoldClass;
  /**
   * Schema for `input` — the value passed to direct `.enqueue()` calls and
   * baked into a trigger row's `with` for event-driven invocations. Parsed
   * exactly ONCE per workflow at the original `enqueue()` call; the
   * post-transform value is stored, replayed on retries, and reused on
   * resume. Zod `.transform()` is therefore safe (non-idempotent
   * transforms don't re-run).
   */
  input: S;
  /**
   * Schema for `event` — the event payload delivered when invoked through
   * the events dispatcher. Use `z.never()` to declare that this job
   * ignores events; the run handler then sees `event: undefined`. Direct
   * `.enqueue()` always passes `event: undefined` regardless of schema.
   */
  event: E;
  /**
   * Handler body. Receives `{ input, event, ctx }` as a single object.
   *
   * DO NOT wrap `ctx.step` / `ctx.waitFor` / `ctx.sleep` in user-level
   * `try/catch`. Suspension is signalled by an internal sentinel error
   * that the jobs worker catches; swallowing it leaves the workflow
   * indefinitely hung. If you must catch around `ctx.*`, gate the catch
   * with `isSuspendSignal(err)` and re-throw.
   */
  run: (args: {
    input: z.infer<S>;
    event: z.infer<E> | undefined;
    ctx: JobCtx;
  }) => Promise<void> | void;
  maxAttempts?: number;
  /**
   * Duration (ms) above which a run of this job files a slow-op report.
   * Defaults to the `slow-op` config `jobMs` (3000). Raise it for jobs
   * expected to run long (backfills, syncs) so they don't file noise.
   */
  slowThresholdMs?: number;
  /**
   * Never run two of these at once — see {@link SerialSpec} for what that
   * means, why it is not a semaphore, and why the set of lane names must stay
   * small and name a resource rather than an input.
   */
  serial?: SerialSpec;
}

/**
 * A job spec — either unscheduled with any {@link Dedup}, or scheduled and
 * therefore `dedup: "singleton"`.
 *
 * **Why a union rather than two optional fields.** A keyed schedule is
 * meaningless on its own terms: the cron payload is always `input.parse({})`,
 * so a `key(input)` function is evaluated against one constant value and yields
 * one constant key — i.e. a singleton wearing a costume. Worse, the cron item
 * built in `worker.ts` hardcodes the singleton job key `${job.name}:_`, and
 * that key is only TOTAL over scheduled jobs if a scheduled job cannot declare
 * anything else. Before that key existed the cron path ignored `dedup`
 * altogether and every tick inserted a new row forever — 57 copies each of six
 * per-minute monitors by the time main's queue wedged on 2026-08-17. Rung 2 of
 * the fix ladder: make the wrong combination a tsc error rather than a
 * convention a future scheduled job can quietly break.
 */
export type DefineJobSpec<
  N extends string,
  S extends z.ZodType,
  E extends z.ZodType,
> =
  | (BaseJobSpec<N, S, E> & {
      dedup: Dedup<S>;
      /** Unscheduled. Declare `schedule` and `dedup` narrows to `"singleton"`. */
      schedule?: undefined;
    })
  | (BaseJobSpec<N, S, E> & {
      /** Forced by {@link schedule} — see the union's note above. */
      dedup: "singleton";
      /**
       * Run this job on a recurring schedule (see {@link ScheduleSpec}). The jobs
       * worker builds a graphile-worker cron item from this at startup.
       *
       * Scheduled jobs MUST have an `input` schema that parses `{}` (all fields
       * optional or defaulted) — the cron payload is built from `input.parse({})`.
       * If that throws, the worker fails loud at startup (it's a defineJob misuse,
       * not a runtime condition).
       */
      schedule: ScheduleSpec;
    });

export interface JobFactory<
  N extends string,
  S extends z.ZodType,
  E extends z.ZodType = z.ZodType,
> extends Registration {
  readonly name: N;
  readonly inputSchema: S;
  readonly eventSchema: E;
  enqueue(input: z.input<S>, opts?: EnqueueOpts): Promise<{ jobId: string }>;
}

// Module-load-time registry. Populated by `defineJob`; the worker reads it at
// dispatch time so adding jobs at runtime (future) doesn't require a restart.
export const jobRegistry = new Map<string, RegisteredJob>();

// Internal payload shape the worker sees. `workflowRunId` is derived from
// the dedup strategy at enqueue time — absent for cron ticks, where the
// worker derives it from the injected `_cron.ts` instead.
export interface JobTaskPayload {
  jobName: string;
  workflowRunId?: string;
  input: unknown;
  event?: unknown;
  /**
   * Injected by graphile-worker's cron scheduler on each tick (absent for
   * direct enqueues). `ts` is the per-minute UTC tick timestamp; the worker
   * derives a stable per-tick `workflowRunId` from it.
   */
  _cron?: { ts: string; backfilled?: boolean };
}

// --- The one derivation of a graphile queue name ------------------------------
//
// A serialized job that is enqueued WITHOUT its queue name escapes its own
// serialization — the row lands with `job_queue_id IS NULL`, graphile fetches it
// regardless of who else is running, and the guarantee silently evaporates for
// that one path. There are five places a job row is inserted (this file's
// two enqueue paths, `resume-job.ts`'s target re-enqueue, `worker.ts`'s
// `scheduleResume`, and `worker.ts`'s cron items), so "remember to pass the
// queue name" is five chances to be wrong and no way to notice.
//
// Hence: the queue name is derived from the REGISTERED JOB and is never a caller
// argument. `queueNameFor` is the single derivation; `graphileSpecFor` is the
// single assembly of a graphile insertion around it, and the raw-SQL enqueue
// path reads its columns off that same spec rather than composing its own. The
// `jobs:no-raw-addjob` check (`../../check/index.ts`) bans `utils.addJob(` and
// `graphile_worker.add_job` everywhere but this file, so a sixth insertion site
// cannot be written without going through here.
//
// The job's TASK IDENTIFIER and PRIORITY join the queue name under exactly the
// same argument, and for exactly the same reason. Which graphile task a row sits
// on is what decides which runners can ever fetch it (`worker.ts`'s ladder), and
// the priority is what makes a runner prefer the longest class it may serve. A
// row inserted on the wrong task is not slow — it is unreachable by the runners
// that were supposed to reserve capacity for it, or reachable by ones that were
// not. Both are properties of the REGISTERED JOB (its `hold`), never caller
// arguments, so they flow through this one assembly with the queue name.

/** `sg:` namespaces our queue names inside graphile's global queue-name space,
 * so they are recognizable in `_private_job_queues` and cannot collide with a
 * name some future library picks. */
const QUEUE_PREFIX = "sg:";

/**
 * The graphile `queue_name` for a registered job, or `undefined` when the job
 * declared no {@link SerialSpec} (the overwhelming majority — an unnamed queue
 * is the fast, unserialized path).
 *
 * `serial: true` → `sg:<jobName>`, serialized against itself only.
 * `serial: { with: "chromium" }` → `sg:lane:chromium`, shared by every job name
 * naming that lane, so N job names serialize against ONE resource.
 */
export function queueNameFor(job: {
  name: string;
  serial?: SerialSpec;
}): string | undefined {
  if (!job.serial) return undefined;
  if (job.serial === true) return `${QUEUE_PREFIX}${job.name}`;
  return `${QUEUE_PREFIX}lane:${job.serial.with}`;
}

/** Everything one insertion of a job row is made of: the graphile task the row
 * sits on, and the `TaskSpec` carrying the rest of its columns. The two travel
 * together because both are derived from the job, and an insertion that took the
 * spec but re-typed the identifier would be exactly the drift this file exists
 * to prevent. */
export interface GraphileInsertion {
  /** The graphile task identifier — the job's hold-class task (`taskFor`). */
  readonly task: string;
  readonly spec: TaskSpec;
}

/**
 * Build the graphile insertion for one row of `job`. Everything a caller
 * legitimately varies per enqueue (`jobKey`, `runAt`, `maxAttempts`) is an
 * argument; the task identifier, the priority and the queue name deliberately
 * are NOT — they come from the job.
 */
export function graphileSpecFor(
  job: { name: string; hold: HoldClass; serial?: SerialSpec },
  opts: GraphileInsertOpts,
): GraphileInsertion {
  return {
    task: taskFor(job.hold),
    spec: {
      queueName: queueNameFor(job),
      priority: priorityFor(job.hold),
      jobKey: opts.jobKey ?? undefined,
      runAt: opts.runAt ?? undefined,
      maxAttempts: opts.maxAttempts,
    },
  };
}

export interface GraphileInsertOpts {
  jobKey?: string | null;
  runAt?: Date | null;
  maxAttempts?: number;
}

/**
 * Insert one job row for an already-resolved {@link RegisteredJob}, bypassing
 * `enqueue`'s input parse and its per-job-name job-key namespacing.
 *
 * `UNSAFE_` because both bypasses matter: the payload is stored verbatim (the
 * caller is responsible for it already being in post-transform shape — see
 * `resume-job.ts` on why re-parsing a resumed input is wrong), and the `jobKey`
 * is taken literally rather than prefixed. General plugin code must call
 * `job.enqueue(...)` instead.
 *
 * It lives here, next to `graphileSpecFor`, so that `utils.addJob` has exactly
 * ONE call site in the repo. The two internal callers (`worker.ts`'s
 * `scheduleResume`, `resume-job.ts`'s target re-enqueue) need the bypasses but
 * must not be free to omit the queue name; routing them through here means they
 * cannot. `jobs:no-raw-addjob` enforces the exclusivity.
 */
export async function UNSAFE_insertJobRow(
  job: { name: string; hold: HoldClass; serial?: SerialSpec },
  payload: JobTaskPayload,
  opts: GraphileInsertOpts,
): Promise<{ jobId: string }> {
  const utils = await getWorkerUtils();
  const insertion = graphileSpecFor(job, opts);
  const added = await utils.addJob(insertion.task, payload, insertion.spec);
  return { jobId: String(added.id) };
}

export function defineJob<
  N extends string,
  S extends z.ZodType,
  E extends z.ZodType,
>(spec: DefineJobSpec<N, S, E>): JobFactory<N, S, E> {
  // Registry write moved into `register()` (the framework calls it during
  // the plugin register phase). `enqueue` doesn't read `jobRegistry` —
  // graphile-worker resolves the handler at job-pickup time, which only
  // starts in `onReady`. So enqueueing pre-register is safe.

  async function enqueue(
    input: unknown,
    opts?: EnqueueOpts,
  ): Promise<{ jobId: string }> {
    // Parse once at enqueue time so the serialized payload is already in
    // the post-transform shape; the worker re-parses as a safety check.
    const parsed = spec.input.parse(input);

    let effectiveJobKey: string | undefined;
    if (spec.dedup === "singleton") {
      effectiveJobKey = "_";
    } else if (spec.dedup !== "none") {
      effectiveJobKey = spec.dedup.key(parsed as z.infer<typeof spec.input>);
    }

    const workflowRunId = effectiveJobKey
      ? `${spec.name}:${effectiveJobKey}`
      : randomUUID();
    const graphileJobKey = effectiveJobKey ? workflowRunId : null;
    const maxAttempts =
      opts?.maxAttempts ?? spec.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    const payload: JobTaskPayload = {
      jobName: spec.name,
      workflowRunId,
      input: parsed,
      event: opts?._event,
    };
    // Both branches below insert the SAME row through two different transports,
    // so both derive their graphile COLUMNS from one spec. Deriving them twice
    // is how the shared-tx path would quietly lose the queue name.
    //
    // What the two transports do NOT share is their PRECONDITION, and reading
    // the sentence above as "these branches can't disagree" is how that went
    // unnoticed for as long as it did. The no-`tx` branch reaches
    // `getWorkerUtils()`, whose `makeWorkerUtils` installs the queue schema as a
    // side effect, so it heals a database that has none. The `tx` branch writes
    // on the CALLER's own connection — it never touches a graphile helper and
    // has no business running 25 migrations inside somebody else's open
    // transaction — so it can only assert. It does, below, and loudly: on a
    // freshly-forked worktree database whose backend has never booted (the
    // schema is excluded from the fork by design — see `queue-schema.ts`), this
    // path used to surface as a bare `3F000` from inside `pg` that named
    // nothing in this repo, and was mis-diagnosed as a test-fixture gap.
    // Installation belongs to whoever provisions or boots the database: the
    // plugin's `onReadyBlocking` for a backend, `installQueueSchema()` for a
    // throwaway test database.
    const graphileOpts: GraphileInsertOpts = {
      jobKey: graphileJobKey,
      runAt: opts?.runAt,
      maxAttempts,
    };

    if (opts?.tx) {
      const insertion = graphileSpecFor(spec, graphileOpts);
      // Shared-tx path: write into graphile_worker.jobs on the caller's
      // transaction client by calling Graphile's documented public SQL
      // function. Rollback drops the row alongside the caller's writes.
      // The reach-in to `_.session.client` is the only facade-piercing in
      // the system; isolated here so a future drizzle bump has exactly
      // one line to fix.
      // biome-ignore lint/suspicious/noExplicitAny: drizzle's session.client is private in d.ts but stable at runtime.
      const client = (opts.tx as any)._.session.client as PoolClient;
      const result = await withQueueSchemaAssert(() =>
        client.query<{ id: string }>(
          `SELECT (graphile_worker.add_job(
             identifier   := $1,
             payload      := $2::json,
             run_at       := $3,
             max_attempts := $4,
             job_key      := $5,
             queue_name   := $6,
             priority     := $7
           )).id::text AS id`,
          [
            // The hold class's task, from the same spec the `addJob` path uses —
            // never a constant. A row inserted here on the legacy task would be
            // fetchable only by the wide runner, silently forfeiting the
            // reservation for every job enqueued inside a transaction.
            insertion.task,
            JSON.stringify(payload),
            insertion.spec.runAt ?? null,
            insertion.spec.maxAttempts ?? null,
            insertion.spec.jobKey ?? null,
            // NULL ⇒ unnamed queue, which is what graphile's own default is and
            // what every non-`serial` job gets. `add_job` takes queue_name as a
            // named argument (sql/000016.sql:8), so passing NULL explicitly is
            // identical to omitting it.
            insertion.spec.queueName ?? null,
            // `priority` is likewise a named argument of `add_job`
            // (sql/000018.sql:4, `priority integer DEFAULT NULL`), coalesced to 0
            // when NULL. Always present here, since it is derived from the class.
            insertion.spec.priority ?? null,
          ],
        ),
      );
      const id = result.rows[0]?.id;
      if (!id) throw new Error("[jobs] graphile_worker.add_job returned no id");
      return { jobId: id };
    }

    return UNSAFE_insertJobRow(spec, payload, graphileOpts);
  }

  const factory: JobFactory<N, S, E> = {
    name: spec.name,
    inputSchema: spec.input,
    eventSchema: spec.event,
    _kind: "job",
    _factory: "defineJob",
    _doc: { label: spec.name },
    enqueue: enqueue as JobFactory<N, S, E>["enqueue"],
    register() {
      if (jobRegistry.has(spec.name)) {
        throw new Error(`[jobs] duplicate job name: ${spec.name}`);
      }
      // Both numbers are right here, and disagreeing is a wiring bug: a job that
      // expects to run longer than its class's ceiling has declared the wrong
      // class. Module-eval time, so it fails the boot loudly rather than filing
      // a slot-hog report on every tick forever.
      const ceilingMs = ceilingMsFor(spec.hold);
      if (
        spec.slowThresholdMs !== undefined &&
        spec.slowThresholdMs > ceilingMs
      ) {
        throw new Error(
          `[jobs] ${spec.name}: slowThresholdMs ${spec.slowThresholdMs}ms exceeds ` +
            `the "${spec.hold}" hold class ceiling of ${ceilingMs}ms — ` +
            `declare a longer \`hold\`, or lower \`slowThresholdMs\``,
        );
      }
      jobRegistry.set(spec.name, {
        name: spec.name,
        hold: spec.hold,
        inputSchema: spec.input,
        eventSchema: spec.event,
        dedup:
          spec.dedup === "singleton"
            ? "singleton"
            : spec.dedup === "none"
              ? "none"
              : "keyed",
        run: spec.run as RegisteredJob["run"],
        maxAttempts: spec.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
        slowThresholdMs: spec.slowThresholdMs,
        schedule: spec.schedule,
        serial: spec.serial,
        enqueue,
      });
    },
  };
  return factory;
}

// Exposed so the events plugin's dispatcher can synchronously resolve and
// invoke a target job by name. General plugin code should NEVER call this —
// use `job.enqueue(...)` instead, which goes through graphile-worker and
// gets retries, concurrency limits, and durability. Calling `.run` directly
// bypasses all of that. The `UNSAFE_` prefix is the contract.
export function UNSAFE_getRegisteredJob(
  name: string,
): RegisteredJob | undefined {
  return jobRegistry.get(name);
}

export function getAllRegisteredJobNames(): Set<string> {
  return new Set(jobRegistry.keys());
}

/** The per-job slow-op threshold (ms) declared via `defineJob({ slowThresholdMs })`,
 * or `undefined` when the job declared none (callers fall back to the config default). */
export function getJobSlowThresholdMs(name: string): number | undefined {
  return jobRegistry.get(name)?.slowThresholdMs;
}

/** The duration class declared via `defineJob({ hold })`, or `undefined` for a
 * job name that is not registered in this backend (a queue row written by a
 * plugin this composition does not load). */
export function getJobHold(name: string): HoldClass | undefined {
  return jobRegistry.get(name)?.hold;
}

// Every registered job that declared a recurring `schedule`. The worker reads
// this at startup to build graphile-worker cron items.
export function getScheduledJobs(): RegisteredJob[] {
  return [...jobRegistry.values()].filter((job) => job.schedule);
}
