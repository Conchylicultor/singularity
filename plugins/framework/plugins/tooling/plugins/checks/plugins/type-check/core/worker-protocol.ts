/**
 * The wire contract between a type-check worker process and whoever spawned it.
 *
 * It lives in `core/` rather than beside the worker because there are two
 * spawners — the `type-check` check and the build's `--skip-checks` fast path —
 * and exactly one worker. A contract only one side can name is a contract that
 * drifts.
 */

/** The job file handed to the worker as `argv[2]` (see `../shared/worker.ts`). */
export interface TypeCheckWorkerJob {
  root: string;
  name: string;
  tsconfigPath: string;
  buildInfoPath: string;
  /** Absolute paths assigned to THIS target's program (closure-cache-filtered). */
  lintFiles: string[];
}

/** The worker's JSON stdout contract (see `../shared/worker.ts`). */
export interface TypeCheckWorkerResult {
  name: string;
  tscErrors: string;
  lintViolations: string;
  /** Absolute paths whose lint produced an error-level (or fatal) message. */
  failedLintFiles: string[];
}
