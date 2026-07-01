import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { getConfig } from "@plugins/config_v2/server";
import { isMain } from "@plugins/infra/plugins/paths/server";
import { buildConfig } from "../../shared";
import { buildRunDebouncedJob } from "./build-run-debounced-job";

// Trailing-debounce window: coalesce a burst of near-sequential pushes into one
// build+restart. Each refAdvanced re-enqueues the singleton debounced job with a
// fresh runAt, pushing the fire time forward until the pushes go quiet.
const DEBOUNCE_MS = 5_000;

export const buildRunJob = defineJob({
  name: "build.run",
  input: z.object({}),
  event: z.never(),
  dedup: "singleton",
  run: async () => {
    if (!isMain()) return;
    const { autoBuild } = getConfig(buildConfig);
    if (!autoBuild) return;
    // Re-enqueue the singleton debounced job with a fresh runAt (jobKeyMode
    // "replace" pushes the not-yet-started job forward = trailing debounce). If a
    // push lands in the sub-ms window while this run() itself holds the lock,
    // graphile inserts a fresh row rather than merging — harmless because the
    // debounced body is fire-and-forget (triggerBuild returns without awaiting the
    // build), so the locked window is sub-millisecond.
    await buildRunDebouncedJob.enqueue({}, { runAt: new Date(Date.now() + DEBOUNCE_MS) });
  },
});
