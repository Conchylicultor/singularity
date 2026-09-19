/**
 * THE way to build a TypeScript program and get a buildinfo out of it. Both
 * producers go through here — the `type-check` check and the build's
 * `--skip-checks` fast path — so the compiler options, and the declaration emit
 * that gives every file in the buildinfo a real signature, are written down
 * once (`../shared/worker.ts`) and cannot drift apart.
 */
import { writeFileSync } from "fs";
import os from "os";
import { join } from "path";
import { fileURLToPath } from "url";
import { spawnCaptured } from "@plugins/infra/plugins/spawn/core";
import type {
  TypeCheckWorkerJob,
  TypeCheckWorkerResult,
} from "./worker-protocol";

const WORKER = fileURLToPath(new URL("../shared/worker.ts", import.meta.url));

/** What the parent measured about the worker PROCESS, on top of its output. */
export interface TypeCheckWorkerRun {
  result: TypeCheckWorkerResult;
  /**
   * Peak RSS of the worker PROCESS (bytes), measured by the parent after exit.
   * `undefined` when the runtime reported no rusage — an unavailable
   * measurement, not a failure: the footprint line is simply omitted.
   */
  maxRssBytes: number | undefined;
  /**
   * User + system CPU the worker burned, in microseconds. THE cost unit for
   * this fleet: wall clock on this host varies 2.5x with load for the identical
   * program build, so a before/after comparison taken in wall clock measures
   * whoever else was running. Same availability caveat as `maxRssBytes`.
   */
  cpuTimeMicros: number | undefined;
}

/**
 * Run the worker to completion. Throws when the worker itself crashed
 * (nonzero exit) — tsc diagnostics are a clean exit with a non-empty
 * `tscErrors`, never an exit code.
 *
 * `background` demotes the child to the background scheduling tier; the caller
 * decides, because the rule differs per spawner (see the check's own
 * `workerBackground()`).
 */
export async function spawnTypeCheckWorker(opts: {
  root: string;
  name: string;
  tsconfigPath: string;
  buildInfoPath: string;
  lintFiles: string[];
  background: boolean;
}): Promise<TypeCheckWorkerRun> {
  const { root, name, tsconfigPath, buildInfoPath, lintFiles, background } =
    opts;
  const jobPath = join(os.tmpdir(), `type-check-${name}-${process.pid}.json`);
  const job: TypeCheckWorkerJob = {
    root,
    name,
    tsconfigPath,
    buildInfoPath,
    lintFiles,
  };
  writeFileSync(jobPath, JSON.stringify(job));
  const spawned = await spawnCaptured([process.execPath, WORKER, jobPath], {
    cwd: root,
    background,
    // A type-check worker builds a whole TypeScript program; cold, that is
    // minutes of unavoidable CPU, and on a saturated box (N agent
    // fleets, all demoted to background QoS) it is longer still by an amount
    // nothing here can predict. There is no shorter deadline to borrow: the
    // human running `./singularity check` IS the deadline, and killing a worker
    // that was making progress would just make the check unusable.
    unbounded:
      "a cold type-check worker legitimately runs for minutes of TS program construction, and the CLI run it belongs to owns no shorter deadline",
  });
  if (spawned.exitCode !== 0) {
    throw new Error(
      `type-check worker for "${name}" exited ${spawned.exitCode}:\n${spawned.stderr.trim() || spawned.stdout.trim()}`,
    );
  }
  // rusage is only final once the child is reaped, and it is a free read (no
  // sampling loop) — getrusage reports the TRUE peak of the run.
  return {
    result: JSON.parse(spawned.stdout) as TypeCheckWorkerResult,
    maxRssBytes: spawned.resourceUsage.maxRssBytes,
    cpuTimeMicros: spawned.resourceUsage.cpuTimeMicros,
  };
}
