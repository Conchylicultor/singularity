import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { getConfig } from "@plugins/config_v2/server";
import { isMain } from "@plugins/infra/plugins/paths/server";
import { buildConfig } from "../../shared";
import { isBuildInflight, triggerBuild } from "./run-build";

export const buildRunJob = defineJob({
  name: "build.run",
  input: z.object({}),
  event: z.never(),
  dedup: "singleton",
  run: async () => {
    if (!isMain()) return;
    if (isBuildInflight()) return;
    const { autoBuild } = getConfig(buildConfig);
    if (!autoBuild) return;
    triggerBuild("auto");
  },
});
