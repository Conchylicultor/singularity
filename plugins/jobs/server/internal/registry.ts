import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { DEFAULT_MAX_ATTEMPTS, JOB_TASK } from "./constants";
import { getWorkerUtils } from "./worker";

export { DEFAULT_MAX_ATTEMPTS } from "./constants";

export interface JobCtx {
  /** Graphile job id. Stable across retries of a single failed job. */
  jobId: string;
  /** 1-indexed attempt number — starts at 1 on the first try. */
  attempt: number;
  /**
   * Stable identity for this workflow run across suspends and resumes.
   * Equals `jobKey` if one was passed to `enqueue`, else a generated uuid.
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
   * timeout. DO NOT wrap in try/catch — suspend is signaled by a sentinel
   * error that the worker catches; swallowing it hangs the workflow. If
   * you must catch (e.g. wrapping in your own retry), gate the catch on
   * `isSuspendSignal(err)` and re-throw.
   */
  waitFor<T extends Record<string, unknown>>(
    event: {
      readonly __kind: "event";
      readonly def: { name: string };
      readonly filter: Record<string, unknown>;
    },
    opts?: {
      where?: Partial<T>;
      match?: (payload: T) => boolean;
      timeoutMs?: number;
      name?: string;
    },
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
  run: (input: unknown, ctx: JobCtx) => Promise<void> | void;
  maxAttempts: number;
  /**
   * Enqueue by the registered job's public factory. Exposed here so the
   * builtin `jobs.resume` can re-enqueue a target by name without holding
   * a typed `JobFactory` reference.
   */
  enqueue: (
    input: unknown,
    opts?: { jobKey?: string; maxAttempts?: number; runAt?: Date },
  ) => Promise<{ jobId: string }>;
}

export interface DefineJobSpec<N extends string, S extends z.ZodType> {
  name: N;
  input: S;
  /**
   * Handler body. The `input` schema is parsed exactly ONCE per workflow,
   * at the original `enqueue()` call. The post-transform value is what's
   * stored in the queue payload, what the handler receives, and what the
   * resume path re-uses verbatim — Zod transforms do NOT re-run on retries
   * or resumes. This means input schemas with non-idempotent transforms
   * (e.g. `z.string().transform(s => s + "!")`) are safe.
   *
   * DO NOT wrap `ctx.step` / `ctx.waitFor` / `ctx.sleep` in user-level
   * `try/catch`. Suspension is signalled by an internal sentinel error
   * that the jobs worker catches; swallowing it leaves the workflow
   * indefinitely hung. If you must catch around `ctx.*`, gate the catch
   * with `isSuspendSignal(err)` and re-throw.
   */
  run: (input: z.infer<S>, ctx: JobCtx) => Promise<void> | void;
  maxAttempts?: number;
}

export interface JobFactory<N extends string, S extends z.ZodType> {
  readonly name: N;
  readonly inputSchema: S;
  enqueue(
    input: z.input<S>,
    opts?: { jobKey?: string; maxAttempts?: number; runAt?: Date },
  ): Promise<{ jobId: string }>;
}

// Module-load-time registry. Populated by `defineJob`; the worker reads it at
// dispatch time so adding jobs at runtime (future) doesn't require a restart.
export const jobRegistry = new Map<string, RegisteredJob>();

// Internal payload shape the worker sees. `workflowRunId` is new — generated
// at enqueue time from `jobKey` when present, else `crypto.randomUUID()`.
export interface JobTaskPayload {
  jobName: string;
  workflowRunId: string;
  input: unknown;
}

export function defineJob<N extends string, S extends z.ZodType>(
  spec: DefineJobSpec<N, S>,
): JobFactory<N, S> {
  if (jobRegistry.has(spec.name)) {
    throw new Error(`[jobs] duplicate job name: ${spec.name}`);
  }

  async function enqueue(
    input: unknown,
    opts?: { jobKey?: string; maxAttempts?: number; runAt?: Date },
  ): Promise<{ jobId: string }> {
    // Parse once at enqueue time so the serialized payload is already in
    // the post-transform shape; the worker re-parses as a safety check.
    const parsed = spec.input.parse(input);
    const workflowRunId = opts?.jobKey ?? randomUUID();
    const utils = await getWorkerUtils();
    const job = await utils.addJob(
      JOB_TASK,
      {
        jobName: spec.name,
        workflowRunId,
        input: parsed,
      } satisfies JobTaskPayload,
      {
        jobKey: opts?.jobKey,
        maxAttempts:
          opts?.maxAttempts ?? spec.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
        runAt: opts?.runAt,
      },
    );
    return { jobId: String(job.id) };
  }

  jobRegistry.set(spec.name, {
    name: spec.name,
    inputSchema: spec.input,
    run: spec.run as (input: unknown, ctx: JobCtx) => Promise<void> | void,
    maxAttempts: spec.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    enqueue,
  });

  const factory: JobFactory<N, S> = {
    name: spec.name,
    inputSchema: spec.input,
    enqueue: enqueue as JobFactory<N, S>["enqueue"],
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
