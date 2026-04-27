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
// The input schema is an open object: the events dispatcher merges jobWith
// (empty) with the event payload (pushId, sha, attemptId, conversationId)
// before parsing, and passthrough() preserves those fields rather than
// failing the parse. The handler ignores them — we only need to know a push
// landed, not which one.
export const buildRunJob = defineJob({
  name: "build.run",
  input: z.object({}).passthrough(),
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
