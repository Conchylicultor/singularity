import { buildRunDebouncedJob } from "./build-run-debounced-job";
import { deploymentWantsBuild } from "./wants-build";

/**
 * Trailing-debounce window: coalesce a burst of near-sequential pushes into one
 * build+restart. Every reconcile re-enqueues the singleton debounced job with a
 * fresh runAt, pushing the fire time forward until the pushes go quiet.
 *
 * Purely an optimisation. The debounced job re-derives the decision before it
 * spawns anything, so losing or duplicating a debounce costs a wasted wakeup,
 * never a wrong build and never a missed one.
 */
const DEBOUNCE_MS = 5_000;

/**
 * Auto-build is a CONVERGENCE loop on "this checkout's HEAD is what is
 * deployed", not a queue of push events. `triggerBuild` DROPS a request that
 * arrives while a build is in flight — and a push landing mid-build is precisely
 * when one does — so the request cannot be remembered, it has to be re-derived.
 * This is that re-derivation.
 *
 * **It takes no argument.** That is the whole point. The old design carried a
 * baseline (the commit the finished build was for) from the caller that started
 * the build to the caller that saw it end — but on a main auto-build those are
 * not the same process: the build restarts the very backend that spawned it, so
 * the baseline died with it. Here there is nothing to carry, so nothing can be
 * lost.
 *
 * Called at three edges — the target moving (`buildRunJob`, on the durable
 * `refAdvanced` trigger), a build reaching terminal (`triggerBuild`'s `finally`
 * and `watchInflightBuild`'s `settle`), and this backend starting (`onReady`).
 * Because the decision is stateless and idempotent (the
 * `build_runs_inflight_uniq` partial index already makes a redundant trigger a
 * no-op), an extra edge is free and a missed edge degrades to "converges at the
 * next edge". Under the old design every net was load-bearing, which is why all
 * three failing at once produced a permanent miss (2026-08-19).
 */
export async function reconcileDeployment(): Promise<void> {
  if (!(await deploymentWantsBuild())) return;
  await buildRunDebouncedJob.enqueue(
    {},
    { runAt: new Date(Date.now() + DEBOUNCE_MS) },
  );
}
