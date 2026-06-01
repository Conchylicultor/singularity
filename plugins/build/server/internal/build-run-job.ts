import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { getConfig } from "@plugins/config_v2/server";
import { isMain } from "@plugins/infra/plugins/paths/server";
import { buildConfig } from "../../shared";
import { triggerBuild } from "./run-build";

export const buildRunJob = defineJob({
  name: "build.run",
  input: z.object({}),
  event: z.never(),
  dedup: "singleton",
  run: async () => {
    if (!isMain()) return;
    const { autoBuild } = getConfig(buildConfig);
    if (!autoBuild) return;
    // triggerBuild is a no-op if a build is already in-flight (durable, DB-backed
    // lock), so a boot-time re-enqueue while a build is mid-restart is safely
    // ignored instead of starting an overlapping build.
    triggerBuild("auto");
  },
});
