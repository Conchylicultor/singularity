import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { deploymentWantsBuild } from "./wants-build";
import { triggerBuild } from "./run-build";

// Trailing edge of the auto-build debounce: `reconcileDeployment` re-enqueues
// this singleton with a fresh runAt at every edge, so a burst collapses into the
// one run that fires once the window goes quiet.
export const buildRunDebouncedJob = defineJob({
  name: "build.run.debounced",
  input: z.object({}),
  event: z.never(),
  dedup: "singleton",
  run: async () => {
    // Re-derived here, not trusted from whenever the enqueue happened. The state
    // can have converged in the debounce window (another backend's build landed,
    // autoBuild was turned off), and re-asking is what makes the debounce a pure
    // coalescing optimisation rather than a correctness mechanism.
    if (!(await deploymentWantsBuild())) return;
    // triggerBuild is a no-op if a build is already in-flight (durable, DB-backed
    // lock), so a boot-time re-enqueue while a build is mid-restart is safely
    // ignored instead of starting an overlapping build.
    triggerBuild("auto");
  },
});
