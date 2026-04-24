import type { z } from "zod";
import { DEFAULT_MAX_ATTEMPTS, JOB_TASK } from "./constants";
import { getWorkerUtils } from "./worker";

export { DEFAULT_MAX_ATTEMPTS } from "./constants";

export interface JobCtx {
  /** Graphile job id. Stable across retries of a single failed job. */
  jobId: string;
  /** 1-indexed attempt number — starts at 1 on the first try. */
  attempt: number;
}

export interface RegisteredJob {
  name: string;
  inputSchema: z.ZodType;
  run: (input: unknown, ctx: JobCtx) => Promise<void> | void;
  maxAttempts: number;
}

export interface DefineJobSpec<N extends string, S extends z.ZodType> {
  name: N;
  input: S;
  run: (input: z.infer<S>, ctx: JobCtx) => Promise<void> | void;
  maxAttempts?: number;
}

export interface JobFactory<N extends string, S extends z.ZodType> {
  readonly name: N;
  readonly inputSchema: S;
  enqueue(
    input: z.input<S>,
    opts?: { jobKey?: string; maxAttempts?: number },
  ): Promise<{ jobId: string }>;
}

// Module-load-time registry. Populated by `defineJob`; the worker reads it at
// dispatch time so adding jobs at runtime (future) doesn't require a restart.
export const jobRegistry = new Map<string, RegisteredJob>();

export function defineJob<N extends string, S extends z.ZodType>(
  spec: DefineJobSpec<N, S>,
): JobFactory<N, S> {
  if (jobRegistry.has(spec.name)) {
    throw new Error(`[jobs] duplicate job name: ${spec.name}`);
  }
  jobRegistry.set(spec.name, {
    name: spec.name,
    inputSchema: spec.input,
    run: spec.run as (input: unknown, ctx: JobCtx) => Promise<void> | void,
    maxAttempts: spec.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
  });

  const factory: JobFactory<N, S> = {
    name: spec.name,
    inputSchema: spec.input,
    async enqueue(input, opts) {
      // Parse once at enqueue time so the serialized payload is already in
      // the post-transform shape; the worker re-parses as a safety check.
      const parsed = spec.input.parse(input);
      const utils = await getWorkerUtils();
      const job = await utils.addJob(
        JOB_TASK,
        { jobName: spec.name, input: parsed },
        {
          jobKey: opts?.jobKey,
          maxAttempts:
            opts?.maxAttempts ?? spec.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
        },
      );
      return { jobId: String(job.id) };
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
