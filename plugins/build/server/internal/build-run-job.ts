import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { reconcileDeployment } from "./reconcile";

export const buildRunJob = defineJob({
  name: "build.run",
  input: z.object({}),
  event: z.never(),
  dedup: "singleton",
  // The "target moved" edge, bound to the durable `git.refAdvanced` trigger in
  // the server barrel. Durable on purpose: a `defineRefReaction` would run
  // in-process on every backend with no retry, whereas a queued job survives a
  // restart and is retried if it fails — and a restart is exactly what a build
  // does to this process.
  //
  // The decision itself lives in `reconcileDeployment`, which re-derives it from
  // durable state rather than from the payload of the event that woke it. So a
  // ref advance this job never saw (a push during a restart) is not lost — the
  // next edge sees the same state and reaches the same conclusion.
  run: async () => {
    await reconcileDeployment();
  },
});
