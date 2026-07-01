import { randomUUID } from "node:crypto";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import type { z } from "zod";
import type { Registration } from "@plugins/framework/plugins/server-core/core";
import { DEFAULT_MAX_ATTEMPTS, JOB_TASK } from "./constants";
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
  /** Recurring schedule, if the job declared one. Read by the worker at
   * startup to build graphile-worker cron items. */
  schedule?: ScheduleSpec;
  /**
   * Enqueue by the registered job's public factory. Exposed here so the
   * builtin `jobs.resume` can re-enqueue a target by name without holding
   * a typed `JobFactory` reference.
   */
  enqueue: (
    input: unknown,
    opts?: EnqueueOpts,
  ) => Promise<{ jobId: string }>;
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
  | "singleton"
  | "none"
  | { key: (input: z.infer<S>) => string };

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

export interface DefineJobSpec<
  N extends string,
  S extends z.ZodType,
  E extends z.ZodType,
> {
  name: N;
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
  dedup: Dedup<S>;
  /**
   * Run this job on a recurring schedule (see {@link ScheduleSpec}). The jobs
   * worker builds a graphile-worker cron item from this at startup.
   *
   * Scheduled jobs MUST have an `input` schema that parses `{}` (all fields
   * optional or defaulted) — the cron payload is built from `input.parse({})`.
   * If that throws, the worker fails loud at startup (it's a defineJob misuse,
   * not a runtime condition).
   */
  schedule?: ScheduleSpec;
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
}

export interface JobFactory<
  N extends string,
  S extends z.ZodType,
  E extends z.ZodType = z.ZodType,
> extends Registration {
  readonly name: N;
  readonly inputSchema: S;
  readonly eventSchema: E;
  enqueue(
    input: z.input<S>,
    opts?: EnqueueOpts,
  ): Promise<{ jobId: string }>;
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

    if (opts?.tx) {
      // Shared-tx path: write into graphile_worker.jobs on the caller's
      // transaction client by calling Graphile's documented public SQL
      // function. Rollback drops the row alongside the caller's writes.
      // The reach-in to `_.session.client` is the only facade-piercing in
      // the system; isolated here so a future drizzle bump has exactly
      // one line to fix.
      // biome-ignore lint/suspicious/noExplicitAny: drizzle's session.client is private in d.ts but stable at runtime.
      const client = (opts.tx as any)._.session.client as PoolClient;
      const result = await client.query<{ id: string }>(
        `SELECT (graphile_worker.add_job(
           identifier   := $1,
           payload      := $2::json,
           run_at       := $3,
           max_attempts := $4,
           job_key      := $5
         )).id::text AS id`,
        [
          JOB_TASK,
          JSON.stringify(payload),
          opts.runAt ?? null,
          maxAttempts,
          graphileJobKey,
        ],
      );
      const id = result.rows[0]?.id;
      if (!id) throw new Error("[jobs] graphile_worker.add_job returned no id");
      return { jobId: id };
    }

    const utils = await getWorkerUtils();
    const job = await utils.addJob(JOB_TASK, payload, {
      jobKey: graphileJobKey ?? undefined,
      maxAttempts,
      runAt: opts?.runAt,
    });
    return { jobId: String(job.id) };
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
      jobRegistry.set(spec.name, {
        name: spec.name,
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
        schedule: spec.schedule,
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

// Every registered job that declared a recurring `schedule`. The worker reads
// this at startup to build graphile-worker cron items.
export function getScheduledJobs(): RegisteredJob[] {
  return [...jobRegistry.values()].filter((job) => job.schedule);
}
