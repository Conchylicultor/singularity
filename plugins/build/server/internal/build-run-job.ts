import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { readConfig } from "@plugins/config/server";
import { buildConfig } from "../../shared/config";
import { isBuildInflight, runBuild } from "./run-build";

// Timestamp of the last auto-build trigger. Surfaced by the build-status
// endpoint so the UI can show when the last auto-build ran.
export let lastAutoBuildAt: string | null = null;

// Durable job that runs `./singularity build`. Bound to the pushes.landed
// event (see build/server/index.ts onReady) and also enqueued directly by the
// startup catch-up path for pushes that landed while the server was down.
//
// The handler reads nothing from input or event — it just needs to know a
// push landed, not which one. `event: z.never()` makes that contract
// explicit: the dispatcher won't try to parse the pushes.landed payload.
export const buildRunJob = defineJob({
  name: "build.run",
  input: z.object({}),
  event: z.never(),
  run: async () => {
    if (isBuildInflight()) return;
    const { autoBuild } = await readConfig(buildConfig);
    if (!autoBuild) return;
    lastAutoBuildAt = new Date().toISOString();
    // runBuild() has an in-process mutex that coalesces overlapping calls,
    // so concurrent job runs await the same build rather than forking vite.
    await runBuild();
  },
});
