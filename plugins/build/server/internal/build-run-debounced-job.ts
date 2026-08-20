import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { decideBuilds } from "./wants-build";
import { triggerBuild } from "./run-build";

// Trailing edge of the auto-build debounce: `reconcileDeployment` re-enqueues
// this singleton with a fresh runAt at every edge, so a burst collapses into the
// one run that fires once the window goes quiet.
export const buildRunDebouncedJob = defineJob({
  name: "build.run.debounced",
  // instant, despite causing a multi-minute build: `triggerBuild` returns
  // `void` after starting a detached `runTracked` root, so the build outlives
  // this run() and never occupies the worker slot.
  hold: "instant",
  input: z.object({}),
  event: z.never(),
  dedup: "singleton",
  run: async () => {
    // Re-derived here, not trusted from whenever the enqueue happened. The state
    // can have converged in the debounce window (another backend's build landed,
    // autoBuild was turned off), and re-asking is what makes the debounce a pure
    // coalescing optimisation rather than a correctness mechanism.
    const decision = await decideBuilds(new Date());
    // MAIN FIRST, and only one of the two per wakeup. `triggerBuild` claims a
    // single durable in-flight slot and is deliberately target-blind, so the
    // second call would be dropped anyway — this makes the priority explicit
    // rather than leaving it to which line runs first. Nothing is lost by
    // yielding: the main build's own terminal edge reconciles again, and the
    // composition it deferred is re-derived there and built then.
    //
    // triggerBuild is a no-op if a build is already in-flight (durable, DB-backed
    // lock), so a boot-time re-enqueue while a build is mid-restart is safely
    // ignored instead of starting an overlapping build.
    if (decision.main) {
      triggerBuild("auto");
      return;
    }
    // ONE invocation with N targets, never N invocations: one install, one
    // codegen, one checks pass, one transcript, one `build_runs` row with N
    // chips. Kept separate from main's own build on purpose — a run whose
    // `targets` were `{singularity, sonata}` would not match
    // `lastClosedAttempt`'s equality predicate, so main's reconciler would
    // conclude main was never built for that commit and build it again.
    if (decision.compositions.length > 0)
      triggerBuild("auto", { compositions: decision.compositions });
  },
});
